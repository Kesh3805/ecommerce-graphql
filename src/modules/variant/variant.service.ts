import { ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { InventoryPolicy } from '../../common/enums/ecommerce.enums';
import { Product, ProductOption } from '../catalog/entities';
import { ProductService } from '../catalog/product.service';
import { InventoryItem, InventoryLevelEntity } from '../inventory/entities/inventory.entity';
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
export class VariantService implements OnModuleInit {
  private readonly logger = new Logger(VariantService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ProductService)) private readonly productService: ProductService,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(InventoryItem) private readonly inventoryItemRepo: Repository<InventoryItem>,
    @InjectRepository(InventoryLevelEntity) private readonly inventoryLevelRepo: Repository<InventoryLevelEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureVariantMediaUrlsColumn();
    } catch (error) {
      this.logger.error('Failed to ensure Variant.media_urls column exists', error as Error);
      throw error;
    }
  }

  private async ensureVariantMediaUrlsColumn(manager: EntityManager = this.dataSource.manager): Promise<void> {
    await manager.query('ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "media_urls" TEXT[]');
  }

  private normalizeMediaUrls(mediaUrls?: string[] | null): string[] | null {
    if (!mediaUrls) {
      return null;
    }

    const normalized = [...new Set(mediaUrls.map((url) => String(url ?? '').trim()).filter((url) => /^https?:\/\//i.test(url)))];
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeSku(sku?: string | null): string | undefined {
    const normalized = String(sku ?? '').trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private isInventorySkuConstraintError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const constraint = String((error as QueryFailedError & { constraint?: string }).constraint ?? '');
    const message = String((error as Error).message ?? '');
    return constraint === 'IDX_9642bb82085eb907964f246fb8' || message.includes('IDX_9642bb82085eb907964f246fb8');
  }

  private throwInventorySkuConflict(sku?: string): never {
    const suffix = sku ? ` '${sku}'` : '';
    throw new ConflictException(`SKU${suffix} already exists in inventory`);
  }

  private async assertSkuAvailable(
    manager: EntityManager,
    sku: string | undefined,
    options?: { excludeVariantId?: number; excludeInventoryItemId?: number },
  ): Promise<void> {
    if (!sku) {
      return;
    }

    const existingVariant = await manager
      .createQueryBuilder(Variant, 'variant')
      .where('variant.sku = :sku', { sku })
      .andWhere(options?.excludeVariantId ? 'variant.variant_id != :variantId' : '1=1', {
        variantId: options?.excludeVariantId,
      })
      .getOne();

    if (existingVariant) {
      throw new ConflictException(`SKU '${sku}' already exists`);
    }

    const existingInventoryItem = await manager
      .createQueryBuilder(InventoryItem, 'inventoryItem')
      .where('inventoryItem.sku = :sku', { sku })
      .andWhere(options?.excludeInventoryItemId ? 'inventoryItem.inventory_item_id != :inventoryItemId' : '1=1', {
        inventoryItemId: options?.excludeInventoryItemId,
      })
      .getOne();

    if (existingInventoryItem) {
      this.throwInventorySkuConflict(sku);
    }
  }

  private async syncProductSearch(productId: number): Promise<void> {
    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    await this.productService.refreshPublicSearchForProduct(productId).catch((error) => {
      this.logger.error(`Failed to refresh search index for product ${productId}`, error as Error);
    });
  }

  async findByProductId(productId: number): Promise<Variant[]> {
    const variants = await this.variantRepo.find({
      where: { product_id: productId },
      relations: { inventory_item: true },
      order: { option1_value: 'ASC', option2_value: 'ASC', option3_value: 'ASC' },
    });

    const inventoryItemIds = variants
      .map((variant) => variant.inventory_item_id)
      .filter((inventoryItemId): inventoryItemId is number => typeof inventoryItemId === 'number');

    const levelsByInventoryItemId =
      inventoryItemIds.length > 0
        ? await this.inventoryLevelRepo
            .find({
              where: { inventory_item_id: In(inventoryItemIds) },
              order: { location_id: 'ASC' },
            })
            .then((rows) =>
              rows.reduce<Map<number, InventoryLevelEntity[]>>((acc, row) => {
                const list = acc.get(row.inventory_item_id) ?? [];
                list.push(row);
                acc.set(row.inventory_item_id, list);
                return acc;
              }, new Map<number, InventoryLevelEntity[]>()),
            )
        : new Map<number, InventoryLevelEntity[]>();

    const hydrated = variants.map((variant) => {
      if (!variant.inventory_item || variant.inventory_item_id == null) {
        return variant;
      }

      return {
        ...variant,
        inventory_item: {
          ...variant.inventory_item,
          levels: levelsByInventoryItemId.get(variant.inventory_item_id) ?? [],
        },
      };
    });

    return hydrated.map((variant) => this.mapVariantWithTitle(variant));
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
    const { product_id, create_inventory, media_urls, sku: rawSku, ...variantData } = input;
    const normalizedMediaUrls = this.normalizeMediaUrls(media_urls);
    const normalizedSku = this.normalizeSku(rawSku);

    await this.ensureVariantMediaUrlsColumn();

    const product = await this.productRepo.findOne({ where: { product_id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    const createdVariant = await this.dataSource.transaction(async (manager) => {
      await this.assertSkuAvailable(manager, normalizedSku);

      let inventoryItemId: number | undefined;

      if (create_inventory) {
        await this.syncTableIdSequence(manager, 'InventoryItem', 'inventory_item_id');
        let item: InventoryItem;
        try {
          item = await manager.save(
            InventoryItem,
            manager.create(InventoryItem, {
              sku: normalizedSku,
              tracked: true,
            }),
          );
        } catch (error) {
          if (this.isInventorySkuConstraintError(error)) {
            this.throwInventorySkuConflict(normalizedSku);
          }
          throw error;
        }
        inventoryItemId = item.inventory_item_id;
      }

      await this.syncTableIdSequence(manager, 'Variant', 'variant_id');

      const variant = await manager.save(
        Variant,
        manager.create(Variant, {
          product_id,
          ...variantData,
          sku: normalizedSku,
          media_urls: normalizedMediaUrls ?? undefined,
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

    await this.syncProductSearch(product_id);
    return createdVariant;
  }

  async update(input: UpdateVariantInput): Promise<Variant> {
    const { variant_id, media_urls, ...updateData } = input;
    const normalizedMediaUrls = media_urls === undefined ? undefined : this.normalizeMediaUrls(media_urls);
    const hasSkuUpdate = Object.prototype.hasOwnProperty.call(updateData, 'sku');
    const normalizedSku = hasSkuUpdate ? this.normalizeSku(updateData.sku) : undefined;

    await this.ensureVariantMediaUrlsColumn();
    const variant = await this.findOne(variant_id);

    const updatedVariant = await this.dataSource.transaction(async (manager) => {
      if (hasSkuUpdate) {
        await this.assertSkuAvailable(manager, normalizedSku, {
          excludeVariantId: variant_id,
          excludeInventoryItemId: variant.inventory_item_id,
        });
      }

      if (updateData.is_default) {
        await manager.update(
          Variant,
          { product_id: variant.product_id },
          {
            is_default: false,
          },
        );
      }

      await manager.update(
        Variant,
        {
          variant_id,
        },
        {
          ...updateData,
          ...(hasSkuUpdate ? { sku: normalizedSku ?? null } : {}),
          ...(normalizedMediaUrls !== undefined ? { media_urls: normalizedMediaUrls } : {}),
        },
      );

      if (hasSkuUpdate && variant.inventory_item_id) {
        try {
          await manager.update(InventoryItem, { inventory_item_id: variant.inventory_item_id }, { sku: normalizedSku ?? null });
        } catch (error) {
          if (this.isInventorySkuConstraintError(error)) {
            this.throwInventorySkuConflict(normalizedSku);
          }
          throw error;
        }
      }

      const hydratedVariant = await manager.findOneOrFail(Variant, {
        where: { variant_id },
        relations: { inventory_item: { levels: true }, product: true },
      });

      return this.mapVariantWithTitle(hydratedVariant);
    });

    await this.syncProductSearch(variant.product_id);
    return updatedVariant;
  }

  async delete(variantId: number): Promise<boolean> {
    const productId = await this.dataSource.transaction(async (manager) => {
      const deletedRows = await manager.query('DELETE FROM "Variant" WHERE "variant_id" = $1 RETURNING "inventory_item_id", "product_id"', [variantId]);
      if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
        throw new NotFoundException(`Variant with ID ${variantId} not found`);
      }

      const inventoryItemId = Number(deletedRows[0]?.inventory_item_id);
      if (Number.isInteger(inventoryItemId) && inventoryItemId > 0) {
        await manager.delete(InventoryItem, { inventory_item_id: inventoryItemId });
      }

      const deletedProductId = Number(deletedRows[0]?.product_id);
      return Number.isInteger(deletedProductId) && deletedProductId > 0 ? deletedProductId : 0;
    });

    if (productId > 0) {
      await this.syncProductSearch(productId);
    }

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

    const generated = await this.dataSource.transaction(async (manager) => {
      const createdVariantIds: number[] = [];

      await this.syncTableIdSequence(manager, 'Variant', 'variant_id');

      if (create_inventory) {
        await this.syncTableIdSequence(manager, 'InventoryItem', 'inventory_item_id');
      }

      for (let index = 0; index < dedupedCombinations.length; index += 1) {
        const combo = dedupedCombinations[index];
        const skuSuffix = combo.map((v) => v.replace(/\s+/g, '-').toUpperCase()).join('-');
        const sku = this.normalizeSku(sku_prefix ? `${sku_prefix}-${skuSuffix}` : skuSuffix);

        await this.assertSkuAvailable(manager, sku);

        let inventoryItemId: number | undefined;
        if (create_inventory) {
          let inventoryItem: InventoryItem;
          try {
            inventoryItem = await manager.save(
              InventoryItem,
              manager.create(InventoryItem, {
                sku,
                tracked: true,
              }),
            );
          } catch (error) {
            if (this.isInventorySkuConstraintError(error)) {
              this.throwInventorySkuConflict(sku);
            }
            throw error;
          }
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

    await this.syncProductSearch(product_id);
    return generated;
  }

  async bulkUpdatePrices(input: BulkUpdateVariantPricesInput): Promise<BulkUpdateResponse> {
    const { variant_ids, price, compare_at_price } = input;

    const touchedProducts = await this.variantRepo
      .createQueryBuilder('variant')
      .select('DISTINCT variant.product_id', 'product_id')
      .where('variant.variant_id IN (:...variantIds)', { variantIds: variant_ids })
      .getRawMany<{ product_id: string }>();

    await this.variantRepo.update(
      { variant_id: In(variant_ids) },
      {
        price,
        ...(compare_at_price !== undefined ? { compare_at_price } : {}),
      },
    );

    const syncTasks: Promise<void>[] = [];
    for (const row of touchedProducts) {
      const productId = Number(row.product_id);
      if (Number.isInteger(productId) && productId > 0) {
        syncTasks.push(this.syncProductSearch(productId));
      }
    }

    await Promise.all(syncTasks);

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

  // Allowed table/column combinations for sequence sync to prevent SQL injection
  private static readonly ALLOWED_TABLE_COLUMNS: ReadonlyMap<string, readonly string[]> = new Map([
    ['Variant', ['variant_id']],
    ['InventoryItem', ['inventory_item_id']],
  ]);

  private async syncTableIdSequence(manager: EntityManager, table: string, column: string): Promise<void> {
    // Validate table and column against whitelist to prevent SQL injection
    const allowedColumns = VariantService.ALLOWED_TABLE_COLUMNS.get(table);
    if (!allowedColumns || !allowedColumns.includes(column)) {
      throw new Error(`Invalid table/column combination: ${table}/${column}`);
    }

    const maxRes = await manager.query(`SELECT COALESCE(MAX("${column}"), 0)::int AS max_id FROM public."${table}"`);
    const nextValue = Number(maxRes[0]?.max_id ?? 0) + 1;

    const serialRes = await manager.query(`SELECT pg_get_serial_sequence('public."${table}"', '${column}') AS seq`);
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
