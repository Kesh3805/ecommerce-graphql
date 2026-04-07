import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { InventoryPolicy } from '../../common/enums/ecommerce.enums';
import { Product, ProductOption } from '../catalog/entities';
import { InventoryItem } from '../inventory/entities/inventory.entity';
import { GenerateVariantsInput, UpdateVariantInput, CreateVariantInput, BulkUpdateVariantPricesInput } from './dto';
import { BulkUpdateResponse, GenerateVariantsResponse } from './dto/variant.response';
import { Variant } from './entities';

interface OptionWithValues {
  option_id: number;
  name: string;
  position: number;
  values: { value: string; position: number }[];
}

@Injectable()
export class VariantService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(InventoryItem) private readonly inventoryItemRepo: Repository<InventoryItem>,
  ) {}

  async findByProductId(productId: number): Promise<Variant[]> {
    const variants = await this.variantRepo.find({
      where: { product_id: productId },
      relations: { inventory_item: { levels: true } },
      order: { option1_value: 'ASC', option2_value: 'ASC', option3_value: 'ASC' },
    });

    return variants.map((variant) => this.mapVariantWithTitle(variant));
  }

  async variantAvailability(variantId: number): Promise<boolean> {
    const variant = await this.variantRepo.findOne({
      where: { variant_id: variantId },
      relations: { inventory_item: { levels: true } },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    const available = (variant.inventory_item?.levels ?? []).reduce((sum, level) => sum + level.available_quantity, 0);
    return available > 0;
  }

  async findOne(variantId: number): Promise<Variant> {
    const variant = await this.variantRepo.findOne({
      where: { variant_id: variantId },
      relations: { inventory_item: { levels: true }, product: true },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    return this.mapVariantWithTitle(variant);
  }

  async create(input: CreateVariantInput): Promise<Variant> {
    const { product_id, create_inventory, ...variantData } = input;

    const product = await this.productRepo.findOne({ where: { product_id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    if (variantData.sku) {
      const existing = await this.variantRepo.findOne({ where: { sku: variantData.sku } });
      if (existing) {
        throw new ConflictException(`SKU '${variantData.sku}' already exists`);
      }
    }

    return this.dataSource.transaction(async (manager) => {
      let inventoryItemId: number | undefined;

      if (create_inventory) {
        await this.syncTableIdSequence(manager, 'InventoryItem', 'inventory_item_id');
        const item = await manager.save(
          InventoryItem,
          manager.create(InventoryItem, {
            sku: variantData.sku,
            tracked: true,
          }),
        );
        inventoryItemId = item.inventory_item_id;
      }

      await this.syncTableIdSequence(manager, 'Variant', 'variant_id');

      const variant = await manager.save(
        Variant,
        manager.create(Variant, {
          product_id,
          ...variantData,
          inventory_policy: variantData.inventory_policy ?? InventoryPolicy.DENY,
          inventory_item_id: inventoryItemId,
          is_default: false,
        }),
      );

      const hydratedVariant = await manager.findOneOrFail(Variant, {
        where: { variant_id: variant.variant_id },
        relations: { inventory_item: { levels: true }, product: true },
      });

      return this.mapVariantWithTitle(hydratedVariant);
    });
  }

  async update(input: UpdateVariantInput): Promise<Variant> {
    const { variant_id, ...updateData } = input;
    const variant = await this.findOne(variant_id);

    if (updateData.sku) {
      const existing = await this.variantRepo
        .createQueryBuilder('variant')
        .where('variant.sku = :sku', { sku: updateData.sku })
        .andWhere('variant.variant_id != :variantId', { variantId: variant_id })
        .getOne();

      if (existing) {
        throw new ConflictException(`SKU '${updateData.sku}' already exists`);
      }
    }

    return this.dataSource.transaction(async (manager) => {
      if (updateData.is_default) {
        await manager.update(
          Variant,
          { product_id: variant.product_id },
          {
            is_default: false,
          },
        );
      }

      await manager.update(Variant, { variant_id }, updateData);
      const hydratedVariant = await manager.findOneOrFail(Variant, {
        where: { variant_id },
        relations: { inventory_item: { levels: true }, product: true },
      });

      return this.mapVariantWithTitle(hydratedVariant);
    });
  }

  async delete(variantId: number): Promise<boolean> {
    const variant = await this.variantRepo.findOne({ where: { variant_id: variantId } });
    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Variant, { variant_id: variantId });
      if (variant.inventory_item_id) {
        await manager.delete(InventoryItem, { inventory_item_id: variant.inventory_item_id });
      }
    });

    return true;
  }

  async generateVariants(input: GenerateVariantsInput): Promise<GenerateVariantsResponse> {
    const { product_id, default_price, sku_prefix, create_inventory } = input;

    const product = await this.productRepo.findOne({
      where: { product_id },
      relations: { variants: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    if ((product.variants ?? []).length > 0) {
      throw new ConflictException('Product already has variants. Delete existing variants before regenerating.');
    }

    const options = await this.optionRepo.find({
      where: { product_id },
      relations: { values: true },
      order: { position: 'ASC', values: { position: 'ASC' } },
    });

    if (options.length === 0) {
      throw new ConflictException('Product has no options. Add options before generating variants.');
    }

    const combinations = this.cartesianProduct(options as OptionWithValues[]);
    const dedupedCombinations = Array.from(new Set(combinations.map((combo) => combo.join('||')))).map((encoded) => encoded.split('||'));

    return this.dataSource.transaction(async (manager) => {
      const createdVariantIds: number[] = [];

      await this.syncTableIdSequence(manager, 'Variant', 'variant_id');

      if (create_inventory) {
        await this.syncTableIdSequence(manager, 'InventoryItem', 'inventory_item_id');
      }

      for (let index = 0; index < dedupedCombinations.length; index += 1) {
        const combo = dedupedCombinations[index];
        const skuSuffix = combo.map((v) => v.replace(/\s+/g, '-').toUpperCase()).join('-');
        const sku = sku_prefix ? `${sku_prefix}-${skuSuffix}` : skuSuffix;

        let inventoryItemId: number | undefined;
        if (create_inventory) {
          const inventoryItem = await manager.save(
            InventoryItem,
            manager.create(InventoryItem, {
              sku,
              tracked: true,
            }),
          );
          inventoryItemId = inventoryItem.inventory_item_id;
        }

        const variant = await manager.save(
          Variant,
          manager.create(Variant, {
            product_id,
            option1_value: combo[0] ?? null,
            option2_value: combo[1] ?? null,
            option3_value: combo[2] ?? null,
            sku,
            price: default_price ?? null,
            inventory_policy: InventoryPolicy.DENY,
            is_default: index === 0,
            inventory_item_id: inventoryItemId,
          }),
        );

        createdVariantIds.push(variant.variant_id);
      }

      const variants = await manager.find(Variant, {
        where: { variant_id: In(createdVariantIds) },
        relations: { inventory_item: { levels: true } },
        order: { option1_value: 'ASC', option2_value: 'ASC', option3_value: 'ASC' },
      });

      return {
        created: variants.length,
        variants: variants.map((variant) => this.mapVariantWithTitle(variant)),
      };
    });
  }

  async bulkUpdatePrices(input: BulkUpdateVariantPricesInput): Promise<BulkUpdateResponse> {
    const { variant_ids, price, compare_at_price } = input;

    await this.variantRepo.update(
      { variant_id: In(variant_ids) },
      {
        price,
        ...(compare_at_price !== undefined ? { compare_at_price } : {}),
      },
    );

    return {
      updated: variant_ids.length,
      variant_ids,
    };
  }

  private cartesianProduct(options: OptionWithValues[]): string[][] {
    if (options.length === 0) {
      return [[]];
    }

    const valueArrays = options.map((option) => option.values.map((value) => value.value));

    return valueArrays.reduce<string[][]>((acc, values) => acc.flatMap((combo) => values.map((value) => [...combo, value])), [[]]);
  }

  private async syncTableIdSequence(manager: EntityManager, table: string, column: string): Promise<void> {
    const maxRes = await manager.query(
      `SELECT COALESCE(MAX("${column}"), 0)::int AS max_id FROM public."${table}"`,
    );
    const nextValue = Number(maxRes[0]?.max_id ?? 0) + 1;

    const serialRes = await manager.query(
      `SELECT pg_get_serial_sequence('public."${table}"', '${column}') AS seq`,
    );
    const serialSeq = serialRes[0]?.seq as string | null;

    const defaultRes = await manager.query(
      `
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2
      `,
      [table, column],
    );

    const defaultText = (defaultRes[0]?.column_default ?? '') as string;
    const defaultMatch = defaultText.match(/nextval\('(.+?)'::regclass\)/i);
    const defaultSeqRaw = defaultMatch?.[1] ?? null;

    const candidateSeqs = new Set<string>();
    if (serialSeq) {
      candidateSeqs.add(serialSeq);
    }

    if (defaultSeqRaw) {
      candidateSeqs.add(defaultSeqRaw);
      candidateSeqs.add(defaultSeqRaw.replace(/"/g, ''));

      if (!defaultSeqRaw.includes('.')) {
        candidateSeqs.add(`public.${defaultSeqRaw}`);
        const withoutQuotes = defaultSeqRaw.replace(/"/g, '');
        candidateSeqs.add(`public.${withoutQuotes}`);
      }
    }

    for (const seqName of candidateSeqs) {
      const existsRes = await manager.query('SELECT to_regclass($1) AS reg', [seqName]);
      if (!existsRes[0]?.reg) {
        continue;
      }

      await manager.query('SELECT setval($1, $2, false)', [seqName, nextValue]);
    }
  }

  private mapVariantWithTitle(variant: Variant): Variant {
    const optionValues = [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean);
    const title = optionValues.length ? optionValues.join(' / ') : 'Default';

    const totalAvailable = (variant.inventory_item?.levels ?? []).reduce((sum, level) => sum + level.available_quantity, 0);

    return {
      ...variant,
      title,
      inventory_item: variant.inventory_item
        ? {
            ...variant.inventory_item,
            total_available: totalAvailable,
          }
        : undefined,
    };
  }
}
