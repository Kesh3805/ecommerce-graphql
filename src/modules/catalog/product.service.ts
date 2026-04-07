import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { ProductStatus } from '../../common/enums/ecommerce.enums';
import { User } from '../user/entities/user.entity';
import { CreateProductInput, UpdateProductInput, ProductFilterInput, PaginationInput, AddProductOptionInput, CreateStoreInput } from './dto';
import { PaginatedProductsResponse } from './dto/product.response';
import { Category, OptionValue, Product, ProductCategory, ProductOption, ProductSEO, Store } from './entities';

const DEFAULT_PAGE_SIZE = 20;
const MAX_OPTIONS_PER_PRODUCT = 3;

@Injectable()
export class ProductService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductSEO) private readonly seoRepo: Repository<ProductSEO>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(OptionValue) private readonly optionValueRepo: Repository<OptionValue>,
    @InjectRepository(ProductCategory) private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
  ) {}

  private isAdmin(user?: User): boolean {
    return user?.role === 'ADMIN';
  }

  private normalize(value: string | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private async findStoresForUser(user: User): Promise<Store[]> {
    const normalizedUserId = String(user.id);
    const normalizedEmail = this.normalize(user.email);
    const firstName = this.normalize(user.name?.split(/\s+/)[0]);

    const allStores = await this.storeRepo.find({ order: { created_at: 'DESC' } });

    const direct = allStores.filter((store) => {
      const owner = this.normalize(store.owner_user_id);
      return owner === normalizedUserId || owner === normalizedEmail;
    });

    if (direct.length > 0) {
      return direct;
    }

    if (!firstName) {
      return [];
    }

    return allStores.filter((store) => this.normalize(store.name).startsWith(firstName));
  }

  private async getAccessibleStoreIds(actor?: User): Promise<number[] | null> {
    if (!actor || this.isAdmin(actor)) {
      return null;
    }

    const stores = await this.findStoresForUser(actor);
    return stores.map((store) => store.store_id);
  }

  private buildEmptyPage(page: number, limit: number): PaginatedProductsResponse {
    return {
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: page > 1,
    };
  }

  async findStores(actor?: User): Promise<Store[]> {
    if (actor && !this.isAdmin(actor)) {
      return this.findStoresForUser(actor);
    }

    return this.storeRepo.find({
      order: { created_at: 'DESC' },
    });
  }

  async findStore(storeId: number, actor?: User): Promise<Store> {
    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);
    if (accessibleStoreIds && !accessibleStoreIds.includes(storeId)) {
      throw new ForbiddenException('You do not have access to this store');
    }

    const store = await this.storeRepo.findOne({ where: { store_id: storeId } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    return store;
  }

  async findCategories(storeId?: number, actor?: User): Promise<Category[]> {
    if (storeId) {
      await this.findStore(storeId, actor);
    }

    return this.categoryRepo.find({
      order: { name: 'ASC' },
    });
  }

  async createStore(input: CreateStoreInput, actor?: User): Promise<Store> {
    const ownerUserId = input.owner_user_id || (actor ? String(actor.id) : undefined);
    if (!ownerUserId) {
      throw new ConflictException('owner_user_id is required');
    }

    const store = await this.storeRepo.save(
      this.storeRepo.create({
        name: input.name,
        owner_user_id: ownerUserId,
      }),
    );

    return this.findStore(store.store_id, actor);
  }

  async findAll(filter: ProductFilterInput = {}, pagination: PaginationInput = {}, actor?: User): Promise<PaginatedProductsResponse> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * limit;
    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);

    if (accessibleStoreIds && accessibleStoreIds.length === 0) {
      return this.buildEmptyPage(page, limit);
    }

    if (accessibleStoreIds && filter.store_id && !accessibleStoreIds.includes(filter.store_id)) {
      return this.buildEmptyPage(page, limit);
    }

    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.seo', 'seo')
      .leftJoinAndSelect('product.options', 'options')
      .leftJoinAndSelect('options.values', 'optionValues')
      .leftJoinAndSelect('product.category_links', 'categoryLinks')
      .leftJoinAndSelect('categoryLinks.category', 'category')
      .orderBy('product.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .distinct(true);

    if (accessibleStoreIds) {
      queryBuilder.andWhere('product.store_id IN (:...accessibleStoreIds)', { accessibleStoreIds });
    }

    if (filter.store_id) {
      queryBuilder.andWhere('product.store_id = :storeId', { storeId: filter.store_id });
    }

    if (filter.status) {
      queryBuilder.andWhere('product.status = :status', { status: filter.status });
    }

    if (filter.category_id) {
      queryBuilder.andWhere('categoryLinks.category_id = :categoryId', { categoryId: filter.category_id });
    }

    if (filter.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('product.title ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('product.description ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('product.brand ILIKE :search', { search: `%${filter.search}%` });
        }),
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    const mapped = items.map((item) => ({
      ...item,
      categories: (item.category_links ?? []).map((link) => link.category),
      options: (item.options ?? []).map((option) => ({
        ...option,
        values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
      })),
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: mapped,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async findOne(productId: number, actor?: User): Promise<Product> {
    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);

    const product = await this.productRepo.findOne({
      where: { product_id: productId },
      relations: {
        seo: true,
        options: { values: true },
        category_links: { category: true },
        variants: {
          inventory_item: {
            levels: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (accessibleStoreIds && !accessibleStoreIds.includes(product.store_id)) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return {
      ...product,
      categories: (product.category_links ?? []).map((link) => link.category),
      options: (product.options ?? []).map((option) => ({
        ...option,
        values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
      })),
    };
  }

  async findByHandle(handle: string, actor?: User): Promise<Product> {
    const seo = await this.seoRepo.findOne({ where: { handle } });
    if (!seo) {
      throw new NotFoundException(`Product with handle '${handle}' not found`);
    }

    return this.findOne(seo.product_id, actor);
  }

  async findByCategory(categoryId: number, pagination: PaginationInput = {}, actor?: User): Promise<PaginatedProductsResponse> {
    return this.findAll({ category_id: categoryId }, pagination, actor);
  }

  // Allowed table/column combinations for sequence sync to prevent SQL injection
  private static readonly ALLOWED_TABLE_COLUMNS: ReadonlyMap<string, readonly string[]> = new Map([
    ['ProductCategory', ['id']],
    ['ProductOption', ['option_id']],
    ['OptionValue', ['value_id']],
  ]);

  private async syncTableIdSequence(manager: EntityManager, table: string, column: string): Promise<void> {
    // Validate table and column against whitelist to prevent SQL injection
    const allowedColumns = ProductService.ALLOWED_TABLE_COLUMNS.get(table);
    if (!allowedColumns || !allowedColumns.includes(column)) {
      throw new Error(`Invalid table/column combination: ${table}/${column}`);
    }

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

  async create(input: CreateProductInput, actor?: User): Promise<Product> {
    const normalizedInput = this.normalizeCreateInput(input);
    const { category_ids, seo, ...productData } = normalizedInput;

    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);
    if (accessibleStoreIds && !accessibleStoreIds.includes(productData.store_id)) {
      throw new ForbiddenException('You do not have access to this store');
    }

    const store = await this.storeRepo.findOne({ where: { store_id: productData.store_id } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${productData.store_id} not found`);
    }

    return this.dataSource.transaction(async (manager) => {
      if (seo?.handle) {
        const existingHandle = await manager.findOne(ProductSEO, {
          where: { handle: seo.handle },
        });
        if (existingHandle) {
          throw new ConflictException(`SEO handle '${seo.handle}' already exists`);
        }
      }

      const product = manager.create(Product, {
        ...productData,
        status: productData.status ?? ProductStatus.DRAFT,
        published_at:
          productData.published_at ??
          ((productData.status ?? ProductStatus.DRAFT) === ProductStatus.ACTIVE ? new Date() : undefined),
      });
      const savedProduct = await manager.save(Product, product);

      if (seo) {
        await manager.save(
          ProductSEO,
          manager.create(ProductSEO, {
            ...this.normalizeSeoInput(seo),
            product_id: savedProduct.product_id,
          }),
        );
      }

      if (category_ids && category_ids.length > 0) {
        const categories = await manager.find(Category, { where: { category_id: In(category_ids) } });
        if (categories.length !== category_ids.length) {
          throw new NotFoundException('One or more categories not found');
        }

        await this.syncTableIdSequence(manager, 'ProductCategory', 'id');

        await manager.save(
          ProductCategory,
          category_ids.map((category_id) =>
            manager.create(ProductCategory, {
              product_id: savedProduct.product_id,
              category_id,
            }),
          ),
        );
      }

      const hydratedProduct = await manager.findOneOrFail(Product, {
        where: { product_id: savedProduct.product_id },
        relations: {
          seo: true,
          options: { values: true },
          category_links: { category: true },
          variants: {
            inventory_item: {
              levels: true,
            },
          },
        },
      });

      return {
        ...hydratedProduct,
        categories: (hydratedProduct.category_links ?? []).map((link) => link.category),
        options: (hydratedProduct.options ?? []).map((option) => ({
          ...option,
          values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
        })),
      };
    });
  }

  async update(input: UpdateProductInput, actor?: User): Promise<Product> {
    const normalizedInput = this.normalizeUpdateInput(input);
    const { product_id, category_ids, seo, ...productData } = normalizedInput;

    await this.findOne(product_id, actor);

    return this.dataSource.transaction(async (manager) => {
      if (seo?.handle) {
        const existingHandle = await manager
          .createQueryBuilder(ProductSEO, 'seo')
          .where('seo.handle = :handle', { handle: seo.handle })
          .andWhere('seo.product_id != :productId', { productId: product_id })
          .getOne();

        if (existingHandle) {
          throw new ConflictException(`SEO handle '${seo.handle}' already exists`);
        }
      }

      await manager.update(Product, { product_id }, productData);

      if (category_ids !== undefined) {
        await manager.delete(ProductCategory, { product_id });

        if (category_ids.length > 0) {
          const categories = await manager.find(Category, { where: { category_id: In(category_ids) } });
          if (categories.length !== category_ids.length) {
            throw new NotFoundException('One or more categories not found');
          }

          await this.syncTableIdSequence(manager, 'ProductCategory', 'id');

          await manager.save(
            ProductCategory,
            category_ids.map((category_id) =>
              manager.create(ProductCategory, {
                product_id,
                category_id,
              }),
            ),
          );
        }
      }

      if (seo) {
        const existingSeo = await manager.findOne(ProductSEO, { where: { product_id } });
        if (existingSeo) {
          await manager.update(ProductSEO, { product_id }, this.normalizeSeoInput(seo));
        } else {
          await manager.save(
            ProductSEO,
            manager.create(ProductSEO, {
              product_id,
              ...this.normalizeSeoInput(seo),
            }),
          );
        }
      }

      const product = await manager.findOneOrFail(Product, {
        where: { product_id },
        relations: {
          seo: true,
          options: { values: true },
          category_links: { category: true },
          variants: {
            inventory_item: {
              levels: true,
            },
          },
        },
      });

      return {
        ...product,
        categories: (product.category_links ?? []).map((link) => link.category),
        options: (product.options ?? []).map((option) => ({
          ...option,
          values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
        })),
      };
    });
  }

  async delete(productId: number, actor?: User): Promise<boolean> {
    await this.findOne(productId, actor);
    await this.productRepo.delete({ product_id: productId });
    return true;
  }

  async addOption(input: AddProductOptionInput, actor?: User): Promise<ProductOption> {
    const { product_id, name, values, position } = input;
    await this.findOne(product_id, actor);

    const optionCount = await this.optionRepo.count({ where: { product_id } });
    if (optionCount >= MAX_OPTIONS_PER_PRODUCT) {
      throw new ConflictException(`Products can have a maximum of ${MAX_OPTIONS_PER_PRODUCT} options`);
    }

    const optionPosition =
      position ??
      (await this.optionRepo
        .createQueryBuilder('option')
        .select('COALESCE(MAX(option.position), -1)', 'max')
        .where('option.product_id = :productId', { productId: product_id })
        .getRawOne<{ max: string }>()
        .then((row) => Number(row.max) + 1));

    return this.dataSource.transaction(async (manager) => {
      await this.syncTableIdSequence(manager, 'ProductOption', 'option_id');

      const option = await manager.save(
        ProductOption,
        manager.create(ProductOption, {
          product_id,
          name,
          position: optionPosition,
        }),
      );

      await this.syncTableIdSequence(manager, 'OptionValue', 'value_id');

      const optionValues = values.map((value, idx) =>
        manager.create(OptionValue, {
          option_id: option.option_id,
          value,
          position: idx,
        }),
      );

      await manager.save(OptionValue, optionValues);

      return manager.findOneOrFail(ProductOption, {
        where: { option_id: option.option_id },
        relations: { values: true },
      });
    });
  }

  async removeOption(optionId: number, actor?: User): Promise<boolean> {
    const option = await this.optionRepo.findOne({ where: { option_id: optionId } });
    if (!option) {
      throw new NotFoundException(`Option with ID ${optionId} not found`);
    }

    await this.findOne(option.product_id, actor);

    await this.optionRepo.delete({ option_id: optionId });
    return true;
  }

  async publishProduct(productId: number, actor?: User): Promise<Product> {
    const product = await this.findOne(productId, actor);

    if (product.status === ProductStatus.ACTIVE) {
      throw new ConflictException('Product is already published');
    }

    await this.productRepo.update(
      { product_id: productId },
      {
        status: ProductStatus.ACTIVE,
        published_at: new Date(),
      },
    );

    return this.findOne(productId, actor);
  }

  async archiveProduct(productId: number, actor?: User): Promise<Product> {
    await this.findOne(productId, actor);

    await this.productRepo.update(
      { product_id: productId },
      {
        status: ProductStatus.ARCHIVED,
      },
    );

    return this.findOne(productId, actor);
  }

  private normalizeSeoInput(seo: CreateProductInput['seo'] | UpdateProductInput['seo']):
    | CreateProductInput['seo']
    | UpdateProductInput['seo'] {
    if (!seo) {
      return seo;
    }

    return {
      ...seo,
      meta_title: seo.meta_title ?? seo.metaTitle,
      meta_description: seo.meta_description ?? seo.metaDescription,
      og_title: seo.og_title ?? seo.ogTitle,
      og_description: seo.og_description ?? seo.ogDescription,
      og_image: seo.og_image ?? seo.ogImage,
    };
  }

  private normalizeCreateInput(input: CreateProductInput): CreateProductInput {
    return {
      ...input,
      store_id: input.store_id ?? input.storeId,
      category_ids: input.category_ids ?? input.categoryIds,
      published_at: input.published_at ?? input.publishedAt,
      seo: this.normalizeSeoInput(input.seo),
    };
  }

  private normalizeUpdateInput(input: UpdateProductInput): UpdateProductInput {
    return {
      ...input,
      product_id: input.product_id ?? input.productId,
      category_ids: input.category_ids ?? input.categoryIds,
      published_at: input.published_at ?? input.publishedAt,
      seo: this.normalizeSeoInput(input.seo),
    };
  }
}
