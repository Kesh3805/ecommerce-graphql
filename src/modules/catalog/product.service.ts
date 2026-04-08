import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { Client } from '@elastic/elasticsearch';
import { InventoryPolicy, ProductStatus } from '../../common/enums/ecommerce.enums';
import { InventoryLevelEntity } from '../inventory/entities';
import { User } from '../user/entities/user.entity';
import { Variant } from '../variant/entities';
import { VariantService } from '../variant/variant.service';
import {
  BulkImportProductsInput,
  CreateProductInput,
  UpdateProductInput,
  ProductFilterInput,
  PaginationInput,
  AddProductOptionInput,
  CreateStoreInput,
  CreateCategoryInput,
  CreateBrandInput,
  SetStoreCountriesInput,
  UpdateCategoryInput,
  UpdateBrandInput,
} from './dto';
import { BrandRecordResponse, BulkImportProductRowResult, BulkImportProductsResponse, PaginatedProductsResponse } from './dto/product.response';
import { PublicStorefrontProduct, PublicStorefrontStore } from './dto/storefront.response';
import { Category, OptionValue, Product, ProductCategory, ProductCountryAvailability, ProductMetafield, ProductOption, ProductSEO, Store } from './entities';

const DEFAULT_PAGE_SIZE = 20;
const MAX_OPTIONS_PER_PRODUCT = 3;
type IndexedPublicProductDocument = PublicStorefrontProduct & {
  handle_lower: string;
  store_slug: string;
  country_codes: string[];
  collection_ids?: number[];
  status: ProductStatus;
  updated_at: string;
};

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  private static readonly PUBLIC_PRODUCT_CACHE_TTL_MS = 300_000;
  private static readonly PUBLIC_STORES_CACHE_TTL_MS = 120_000;
  private static readonly AVAILABLE_COUNTRIES_CACHE_TTL_MS = 60_000;
  private static readonly DEFAULT_PRODUCT_DETAIL_INDEX = 'products_detail_v1';
  private readonly publicProductCache = new Map<string, { expiresAt: number; value: PublicStorefrontProduct | null }>();
  private readonly publicProductInflight = new Map<string, Promise<PublicStorefrontProduct | null>>();
  private readonly publicStoresCache = new Map<string, { expiresAt: number; value: PublicStorefrontStore[] }>();
  private readonly publicStoresInflight = new Map<string, Promise<PublicStorefrontStore[]>>();
  private readonly publicStoreBySlugCache = new Map<string, { expiresAt: number; value: PublicStorefrontStore | null }>();
  private readonly publicStoreBySlugInflight = new Map<string, Promise<PublicStorefrontStore | null>>();
  private readonly availableCountriesCache = new Map<number, { expiresAt: number; value: string[] }>();
  private readonly esClient?: Client;
  private readonly esProductDetailIndex: string;
  private readonly esEnabled: boolean;
  private esIndexReady = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly variantService: VariantService,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(OptionValue) private readonly optionValueRepo: Repository<OptionValue>,
    @InjectRepository(ProductCategory) private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(ProductMetafield) private readonly metafieldRepo: Repository<ProductMetafield>,
    @InjectRepository(ProductCountryAvailability) private readonly productCountryAvailabilityRepo: Repository<ProductCountryAvailability>,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
    @InjectRepository(InventoryLevelEntity) private readonly inventoryLevelRepo: Repository<InventoryLevelEntity>,
  ) {
    const node = (process.env.ELASTICSEARCH_NODE ?? '').trim();
    const username = (process.env.ELASTICSEARCH_USERNAME ?? '').trim();
    const password = process.env.ELASTICSEARCH_PASSWORD ?? '';

    this.esProductDetailIndex =
      (process.env.ELASTICSEARCH_PRODUCT_DETAIL_INDEX ?? ProductService.DEFAULT_PRODUCT_DETAIL_INDEX).trim() || ProductService.DEFAULT_PRODUCT_DETAIL_INDEX;
    this.esEnabled = node.length > 0;

    if (this.esEnabled) {
      this.esClient = new Client({
        node,
        ...(username ? { auth: { username, password } } : {}),
      });
      // Initialize index eagerly to avoid per-request overhead
      this.initializeEsIndex();
    }
  }

  private initializeEsIndex(): void {
    if (!this.esClient) return;
    this.esClient.indices
      .exists({ index: this.esProductDetailIndex })
      .then((exists) => {
        if (!exists) {
          return this.esClient!.indices.create({
            index: this.esProductDetailIndex,
            mappings: {
              dynamic: true,
              properties: {
                handle_lower: { type: 'keyword' },
                store_slug: { type: 'keyword' },
                product_id: { type: 'integer' },
                store_id: { type: 'integer' },
                country_codes: { type: 'keyword' },
                collection_ids: { type: 'integer' },
                status: { type: 'keyword' },
                updated_at: { type: 'date' },
              },
            },
          });
        }
      })
      .then(() => {
        this.esIndexReady = true;
      })
      .catch((error) => {
        console.error('Failed to initialize Elasticsearch index:', error);
      });
  }

  private invalidatePublicCaches(): void {
    this.publicProductCache.clear();
    this.publicProductInflight.clear();
    this.publicStoresCache.clear();
    this.publicStoresInflight.clear();
    this.publicStoreBySlugCache.clear();
    this.publicStoreBySlugInflight.clear();
    this.availableCountriesCache.clear();
  }

  private getCachedPublicProduct(handle: string): PublicStorefrontProduct | null | undefined {
    const cacheEntry = this.publicProductCache.get(handle);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.publicProductCache.delete(handle);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedPublicProduct(handle: string, value: PublicStorefrontProduct | null): void {
    this.publicProductCache.set(handle, {
      value,
      expiresAt: Date.now() + ProductService.PUBLIC_PRODUCT_CACHE_TTL_MS,
    });
  }

  private getCachedPublicStores(cacheKey: string): PublicStorefrontStore[] | undefined {
    const cacheEntry = this.publicStoresCache.get(cacheKey);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.publicStoresCache.delete(cacheKey);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedPublicStores(cacheKey: string, value: PublicStorefrontStore[]): void {
    this.publicStoresCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ProductService.PUBLIC_STORES_CACHE_TTL_MS,
    });
  }

  private getCachedAvailableCountries(storeId: number): string[] | undefined {
    const cacheEntry = this.availableCountriesCache.get(storeId);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.availableCountriesCache.delete(storeId);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedAvailableCountries(storeId: number, value: string[]): void {
    this.availableCountriesCache.set(storeId, {
      value,
      expiresAt: Date.now() + ProductService.AVAILABLE_COUNTRIES_CACHE_TTL_MS,
    });
  }

  private getEsDocumentId(handle: string): string {
    return handle.trim().toLowerCase();
  }

  private async ensureProductDetailIndex(): Promise<void> {
    // Index is initialized eagerly in constructor - just wait if not ready yet
    if (!this.esEnabled || !this.esClient) {
      return;
    }
    // If already ready, return immediately
    if (this.esIndexReady) {
      return;
    }
    // Wait briefly for async initialization (max 50ms)
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private async loadPublicProductByHandleFromSearchIndex(handle: string, countryCode?: string): Promise<PublicStorefrontProduct | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    await this.ensureProductDetailIndex();

    try {
      const response = await this.esClient.get<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        id: this.getEsDocumentId(handle),
      });

      const source = response._source;
      if (!source || source.status !== ProductStatus.ACTIVE) {
        return null;
      }

      const sourceCountryCodes = source.country_codes ?? [];
      if (countryCode && sourceCountryCodes.length > 0 && !sourceCountryCodes.includes(countryCode)) {
        return null;
      }

      return {
        product_id: source.product_id,
        store_id: source.store_id,
        store_name: source.store_name,
        title: source.title,
        brand: source.brand,
        description: source.description,
        handle: source.handle,
        image_url: source.image_url,
        media_urls: source.media_urls,
        price: source.price,
        compare_at_price: source.compare_at_price,
        options: source.options,
        variants: source.variants,
      };
    } catch (error) {
      const statusCode = (error as { meta?: { statusCode?: number } })?.meta?.statusCode;
      if (statusCode === 404) {
        return null;
      }

      console.error('Failed to fetch product ' + handle + ' from Elasticsearch:', error);
      return null;
    }
  }

  private mapIndexedDocumentToPublicProduct(source: IndexedPublicProductDocument): PublicStorefrontProduct {
    return {
      product_id: source.product_id,
      store_id: source.store_id,
      store_name: source.store_name,
      title: source.title,
      brand: source.brand,
      description: source.description,
      handle: source.handle,
      image_url: source.image_url,
      media_urls: source.media_urls,
      price: source.price,
      compare_at_price: source.compare_at_price,
      options: source.options,
      variants: source.variants,
    };
  }

  private mapIndexedDocumentToPublicProductSummary(source: IndexedPublicProductDocument): PublicStorefrontProduct {
    const variants = (source.variants ?? []).map((variant) => ({
      variant_id: variant.variant_id,
      title: variant.title ?? 'Default',
      sku: variant.sku,
      option1_value: variant.option1_value,
      option2_value: variant.option2_value,
      option3_value: variant.option3_value,
      price: variant.price,
      compare_at_price: variant.compare_at_price,
      media_urls: variant.media_urls,
      inventory_available: undefined,
    }));

    const pricedVariants = variants.filter((variant) => variant.price != null).sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    const defaultVariant = pricedVariants[0] ?? variants[0];

    return {
      product_id: source.product_id,
      store_id: source.store_id,
      store_name: source.store_name,
      title: source.title,
      brand: source.brand,
      description: source.description,
      handle: source.handle,
      image_url: source.image_url,
      media_urls: source.media_urls,
      price: defaultVariant?.price,
      compare_at_price: defaultVariant?.compare_at_price,
      options: [],
      variants,
    };
  }

  private async loadPublicStorefrontDataFromSearchIndex(
    normalizedStoreLimit: number,
    normalizedProductLimit: number,
    normalizedCountryCode?: string,
  ): Promise<PublicStorefrontStore[] | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    await this.ensureProductDetailIndex();

    try {
      // Use filter context for non-scoring filters (enables ES query caching)
      const filterClauses: Record<string, unknown>[] = [{ term: { status: ProductStatus.ACTIVE } }];

      if (normalizedCountryCode) {
        filterClauses.push({
          bool: {
            should: [{ term: { country_codes: normalizedCountryCode } }, { bool: { must_not: { exists: { field: 'country_codes' } } } }],
            minimum_should_match: 1,
          },
        });
      }

      const response = await this.esClient.search<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        size: normalizedStoreLimit * normalizedProductLimit * 2,
        track_total_hits: false,
        _source: ['product_id', 'store_id', 'store_name', 'title', 'brand', 'handle', 'image_url', 'price', 'compare_at_price', 'variants'],
        sort: [{ updated_at: { order: 'desc' } }, { product_id: { order: 'desc' } }],
        query: {
          bool: {
            filter: filterClauses,
          },
        },
      });

      const storeOrder: number[] = [];
      const storeNameById = new Map<number, string>();
      const productsByStoreId = new Map<number, PublicStorefrontProduct[]>();

      for (const hit of response.hits.hits) {
        const source = hit._source;
        if (!source) continue;

        if (!storeNameById.has(source.store_id)) {
          if (storeOrder.length >= normalizedStoreLimit) continue;

          storeOrder.push(source.store_id);
          storeNameById.set(source.store_id, source.store_name);
        }

        const list = productsByStoreId.get(source.store_id) ?? [];
        if (list.length >= normalizedProductLimit) continue;

        list.push(this.mapIndexedDocumentToPublicProductSummary(source));
        productsByStoreId.set(source.store_id, list);
      }

      return storeOrder.map((storeId) => ({
        store_id: storeId,
        name: storeNameById.get(storeId) ?? `Store ${storeId}`,
        products: productsByStoreId.get(storeId) ?? [],
      }));
    } catch (error) {
      console.error('Failed to fetch public storefront data from Elasticsearch:', error);
      return null;
    }
  }

  private async loadAvailableCountriesByStoreFromSearchIndex(storeId: number): Promise<string[] | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    await this.ensureProductDetailIndex();

    try {
      const response = await this.esClient.search<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        size: 0,
        track_total_hits: false,
        query: {
          bool: {
            filter: [{ term: { store_id: storeId } }, { term: { status: ProductStatus.ACTIVE } }],
          },
        },
        aggs: {
          country_codes: {
            terms: {
              field: 'country_codes',
              size: 300,
              order: { _key: 'asc' },
            },
          },
        },
      });

      const buckets = ((response.aggregations as { country_codes?: { buckets?: Array<{ key: string }> } } | undefined)?.country_codes?.buckets ?? []) as Array<{
        key: string;
      }>;

      return buckets.map((bucket) => bucket.key).filter((value) => /^[A-Z]{2}$/.test(value));
    } catch (error) {
      console.error('Failed to fetch available countries for store ' + storeId + ' from Elasticsearch:', error);
      return null;
    }
  }

  private async findAllFromSearchIndex(
    filter: ProductFilterInput,
    pagination: PaginationInput,
    accessibleStoreIds: number[] | null,
  ): Promise<PaginatedProductsResponse | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    if (filter.category_id) {
      return null;
    }

    // Elasticsearch index currently stores public ACTIVE products only.
    // For admin pages that need DRAFT/ARCHIVED visibility, fall back to DB.
    if (!filter.status || filter.status !== ProductStatus.ACTIVE) {
      return null;
    }

    await this.ensureProductDetailIndex();

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * limit;
    const normalizedSearch = (filter.search ?? '').trim();

    try {
      // Separate filter clauses (non-scoring) from must clauses (scoring)
      const filterClauses: Record<string, unknown>[] = [{ term: { status: ProductStatus.ACTIVE } }];
      const mustClauses: Record<string, unknown>[] = [];

      if (filter.store_id) {
        filterClauses.push({ term: { store_id: filter.store_id } });
      }

      if (accessibleStoreIds) {
        filterClauses.push({ terms: { store_id: accessibleStoreIds } });
      }

      // Search queries need scoring, so keep in must
      if (normalizedSearch) {
        mustClauses.push({
          multi_match: {
            query: normalizedSearch,
            fields: ['title^3', 'description', 'brand', 'handle'],
            type: 'best_fields',
            operator: 'and',
          },
        });
      }

      const response = await this.esClient.search<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        from: skip,
        size: limit,
        track_total_hits: true,
        _source: ['product_id'],
        sort: [{ updated_at: { order: 'desc' } }, { product_id: { order: 'desc' } }],
        query: {
          bool: {
            filter: filterClauses,
            ...(mustClauses.length > 0 ? { must: mustClauses } : {}),
          },
        },
      });

      const productIds = response.hits.hits.map((hit) => hit._source?.product_id).filter((productId): productId is number => typeof productId === 'number');

      const totalHits = typeof response.hits.total === 'number' ? response.hits.total : (response.hits.total?.value ?? 0);

      if (productIds.length === 0) {
        return {
          ...this.buildEmptyPage(page, limit),
          total: totalHits,
          totalPages: Math.ceil(totalHits / limit) || 1,
          hasNextPage: page < (Math.ceil(totalHits / limit) || 1),
        };
      }

      const products = await this.productRepo.find({
        where: { product_id: In(productIds) },
        relations: {
          options: { values: true },
          category_links: { category: true },
        },
      });

      const productById = new Map<number, Product>(products.map((product) => [product.product_id, product]));
      const orderedProducts = productIds
        .map((productId) => productById.get(productId))
        .filter((product): product is Product => Boolean(product))
        .map((product) => ({
          ...this.withProjectedFields(product),
          categories: (product.category_links ?? []).map((link) => link.category),
          options: (product.options ?? []).map((option) => ({
            ...option,
            values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
          })),
        }));

      const withMetafields = await this.attachMetafields(orderedProducts);
      const withCountries = await this.attachCountryCodes(withMetafields);
      const totalPages = Math.ceil(totalHits / limit) || 1;

      return {
        items: withCountries,
        total: totalHits,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Failed to fetch admin product listing from Elasticsearch:', error);
      return null;
    }
  }

  private async deletePublicProductFromSearchIndexByHandle(handle: string): Promise<void> {
    if (!this.esEnabled || !this.esClient) {
      return;
    }

    await this.ensureProductDetailIndex();

    try {
      await this.esClient.delete({
        index: this.esProductDetailIndex,
        id: this.getEsDocumentId(handle),
        refresh: 'wait_for',
      });
    } catch (error) {
      const statusCode = (error as { meta?: { statusCode?: number } })?.meta?.statusCode;
      if (statusCode !== 404) {
        console.error('Failed to delete product ' + handle + ' from Elasticsearch:', error);
      }
    }
  }

  private async deletePublicProductFromSearchIndexByProductId(productId: number): Promise<void> {
    if (!this.esEnabled || !this.esClient) {
      return;
    }

    await this.ensureProductDetailIndex();

    try {
      await this.esClient.deleteByQuery({
        index: this.esProductDetailIndex,
        refresh: true,
        query: {
          term: {
            product_id: productId,
          },
        },
      });
    } catch (error) {
      console.error('Failed to delete product ' + productId + ' from Elasticsearch:', error);
    }
  }

  private async syncPublicProductToSearchIndex(handleOrId: string): Promise<void> {
    if (!this.esEnabled || !this.esClient) {
      return;
    }

    const normalized = (handleOrId ?? '').trim();
    if (!normalized) {
      return;
    }

    await this.ensureProductDetailIndex();

    const publicProduct = await this.loadPublicProductByHandle(normalized);
    if (!publicProduct) {
      if (/^\d+$/.test(normalized)) {
        await this.deletePublicProductFromSearchIndexByProductId(Number(normalized));
      } else {
        await this.deletePublicProductFromSearchIndexByHandle(normalized);
      }
      return;
    }

    const productCountrySetMap = await this.getProductCountrySetMap([publicProduct.product_id]);
    const countryCodes = [...(productCountrySetMap.get(publicProduct.product_id) ?? new Set<string>())].sort();
    const collectionRows = await this.dataSource.query<{ collection_id: number | string }[]>(
      'SELECT "collection_id" FROM "CollectionProduct" WHERE "product_id" = $1 ORDER BY "position" ASC',
      [publicProduct.product_id],
    );
    const collectionIds = collectionRows.map((row) => Number(row.collection_id)).filter((value) => Number.isFinite(value));

    const document: IndexedPublicProductDocument = {
      ...publicProduct,
      handle_lower: this.getEsDocumentId(publicProduct.handle),
      store_slug: this.normalizeStoreSlug(publicProduct.store_name),
      country_codes: countryCodes,
      collection_ids: collectionIds,
      status: ProductStatus.ACTIVE,
      updated_at: new Date().toISOString(),
    };

    try {
      await this.esClient.index({
        index: this.esProductDetailIndex,
        id: this.getEsDocumentId(publicProduct.handle),
        document,
        refresh: 'wait_for',
      });
    } catch (error) {
      console.error('Failed to sync product ' + publicProduct.handle + ' to Elasticsearch:', error);
    }
  }
  private normalizeCountryCode(value: string | undefined): string | undefined {
    const normalized = (value ?? '').trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }

    if (!/^[A-Z]{2}$/.test(normalized)) {
      throw new BadRequestException(`Invalid country code '${value}'. Use ISO-2 uppercase codes like US or GB.`);
    }

    return normalized;
  }

  private normalizeCountryCodes(values: string[] | undefined): string[] | undefined {
    if (values === undefined) {
      return undefined;
    }

    const unique = new Set<string>();
    for (const value of values) {
      const normalized = this.normalizeCountryCode(value);
      if (normalized) {
        unique.add(normalized);
      }
    }

    return [...unique].sort();
  }

  private async getProductCountrySetMap(productIds: number[]): Promise<Map<number, Set<string>>> {
    if (productIds.length === 0) {
      return new Map<number, Set<string>>();
    }

    const rows = await this.productCountryAvailabilityRepo
      .createQueryBuilder('availability')
      .select(['availability.product_id AS product_id', 'availability.country_code AS country_code'])
      .where('availability.product_id IN (:...productIds)', { productIds })
      .andWhere('availability.is_available = true')
      .orderBy('availability.country_code', 'ASC')
      .getRawMany<{ product_id: number | string | null; country_code: string }>();

    const result = new Map<number, Set<string>>();
    for (const row of rows) {
      const productId = Number(row.product_id);
      if (!Number.isInteger(productId) || productId <= 0) {
        continue;
      }

      const existing = result.get(productId) ?? new Set<string>();
      existing.add(row.country_code);
      result.set(productId, existing);
    }

    return result;
  }

  private isProductAvailableForCountry(product: Product, countryCode: string, productCountrySetMap: Map<number, Set<string>>): boolean {
    const productCountries = productCountrySetMap.get(product.product_id);
    if (productCountries && productCountries.size > 0) {
      return productCountries.has(countryCode);
    }

    return true;
  }

  private async findActivePublicProductEntity(handleOrId: string): Promise<Product | null> {
    const byHandle = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.store', 'store')
      .where('product.handle = :handle', { handle: handleOrId })
      .andWhere('product.status = :status', { status: ProductStatus.ACTIVE })
      .getOne();

    if (byHandle) {
      return byHandle;
    }

    const resolvedProductId = /^\d+$/.test(handleOrId) ? Number(handleOrId) : null;
    if (resolvedProductId == null) {
      return null;
    }

    return this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.store', 'store')
      .where('product.product_id = :productId', { productId: resolvedProductId })
      .andWhere('product.status = :status', { status: ProductStatus.ACTIVE })
      .getOne();
  }

  private async loadPublicProductByHandle(handle: string, countryCode?: string): Promise<PublicStorefrontProduct | null> {
    const product = await this.findActivePublicProductEntity(handle);

    if (!product || !product.store) {
      return null;
    }

    const normalizedCountryCode = this.normalizeCountryCode(countryCode);
    if (normalizedCountryCode) {
      const productCountrySetMap = await this.getProductCountrySetMap([product.product_id]);

      if (!this.isProductAvailableForCountry(product, normalizedCountryCode, productCountrySetMap)) {
        return null;
      }
    }

    const [variants, options] = await Promise.all([
      this.variantRepo.find({
        where: { product_id: product.product_id },
        relations: { inventory_item: true },
        order: {
          is_default: 'DESC',
          variant_id: 'ASC',
        },
      }),
      this.optionRepo.find({
        where: { product_id: product.product_id },
        relations: { values: true },
        order: { position: 'ASC' },
      }),
    ]);

    const hydratedProduct: Product = {
      ...product,
      variants,
      options: options.map((option) => ({
        ...option,
        values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
      })),
    };

    const inventoryAvailabilityMap = await this.getInventoryAvailabilityMap([hydratedProduct]);
    return this.mapPublicStorefrontProduct(hydratedProduct, product.store, inventoryAvailabilityMap);
  }

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

    const direct = await this.storeRepo
      .createQueryBuilder('store')
      .where('store.owner_user_id = :userId', { userId: normalizedUserId })
      .orWhere('LOWER(store.owner_user_id) = :ownerEmail', { ownerEmail: normalizedEmail })
      .orderBy('store.created_at', 'DESC')
      .getMany();

    if (direct.length > 0) {
      return direct;
    }

    if (!firstName) {
      return [];
    }

    return this.storeRepo
      .createQueryBuilder('store')
      .where('LOWER(store.name) LIKE :prefix', { prefix: `${firstName}%` })
      .orderBy('store.created_at', 'DESC')
      .getMany();
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

  private selectPrimaryImage(mediaUrls: string[] | undefined, fallback?: string): string | undefined {
    const candidates = mediaUrls ?? [];
    if (candidates.length > 0 && candidates[0]) {
      return candidates[0];
    }

    return fallback;
  }

  private getFlatMediaUrls(product: Product): string[] {
    const urls = product.media_urls;
    if (!Array.isArray(urls)) {
      return [];
    }

    return urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }

  private toPublicVariantTitle(variant: Variant): string {
    const parts = [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : 'Default';
  }

  private async getInventoryAvailabilityMap(products: Product[]): Promise<Map<number, number>> {
    const inventoryItemIds = products
      .flatMap((product) => product.variants ?? [])
      .map((variant) => variant.inventory_item_id)
      .filter((id): id is number => typeof id === 'number');

    if (inventoryItemIds.length === 0) {
      return new Map<number, number>();
    }

    const rows = await this.inventoryLevelRepo
      .createQueryBuilder('level')
      .select('level.inventory_item_id', 'inventory_item_id')
      .addSelect('COALESCE(SUM(level.available_quantity), 0)', 'available_quantity')
      .where('level.inventory_item_id IN (:...inventoryItemIds)', { inventoryItemIds })
      .groupBy('level.inventory_item_id')
      .getRawMany<{ inventory_item_id: string; available_quantity: string }>();

    return new Map<number, number>(rows.map((row) => [Number(row.inventory_item_id), Number(row.available_quantity)]));
  }

  private projectSeo(product: Product): ProductSEO | undefined {
    if (!product.handle) {
      return undefined;
    }

    return {
      product_seo_id: product.product_id,
      product_id: product.product_id,
      handle: product.handle,
      meta_title: product.meta_title,
      meta_description: product.meta_description,
      og_title: product.og_title,
      og_description: product.og_description,
      og_image: product.og_image,
    };
  }

  private projectMedia(
    product: Product,
  ): { media_id: number; product_id: number; url: string; alt_text?: string; type?: string; position: number; is_cover: boolean; created_at: Date }[] {
    const urls = this.getFlatMediaUrls(product);
    return urls.map((url, index) => ({
      media_id: product.product_id * 100000 + (index + 1),
      product_id: product.product_id,
      url,
      alt_text: undefined,
      type: 'image',
      position: index,
      is_cover: index === 0,
      created_at: product.created_at,
    }));
  }

  private withProjectedFields(product: Product): Product {
    return {
      ...product,
      seo: this.projectSeo(product),
      media: this.projectMedia(product),
    };
  }

  private normalizeMetafieldsInput(metafields: CreateProductInput['metafields'] | UpdateProductInput['metafields']): ProductMetafield[] | undefined {
    if (metafields === undefined) {
      return undefined;
    }

    const seenKeys = new Set<string>();
    const normalized: ProductMetafield[] = [];

    for (const entry of metafields) {
      const key = (entry?.key ?? '').trim();
      if (!key) {
        continue;
      }

      const dedupeKey = key.toLowerCase();
      if (seenKeys.has(dedupeKey)) {
        continue;
      }

      seenKeys.add(dedupeKey);
      normalized.push({
        id: 0,
        owner_type: 'product',
        owner_id: 0,
        key,
        value: entry.value?.trim() || undefined,
      });
    }

    return normalized;
  }

  private async syncProductMetafields(manager: EntityManager, productId: number, metafields: ProductMetafield[] | undefined): Promise<void> {
    if (metafields === undefined) {
      return;
    }

    await manager.delete(ProductMetafield, {
      owner_type: 'product',
      owner_id: productId,
    });

    if (metafields.length === 0) {
      return;
    }

    await manager.save(
      ProductMetafield,
      metafields.map((entry) =>
        manager.create(ProductMetafield, {
          owner_type: 'product',
          owner_id: productId,
          key: entry.key,
          value: entry.value,
        }),
      ),
    );
  }

  private async attachMetafields(products: Product[]): Promise<Product[]> {
    if (products.length === 0) {
      return products;
    }

    const productIds = products.map((product) => product.product_id);
    const metafields = await this.metafieldRepo.find({
      where: {
        owner_type: 'product',
        owner_id: In(productIds),
      },
      order: {
        key: 'ASC',
      },
    });

    const byProductId = new Map<number, ProductMetafield[]>();
    for (const metafield of metafields) {
      const list = byProductId.get(metafield.owner_id) ?? [];
      list.push(metafield);
      byProductId.set(metafield.owner_id, list);
    }

    return products.map((product) => ({
      ...product,
      metafields: byProductId.get(product.product_id) ?? [],
    }));
  }

  private async attachCountryCodes(products: Product[]): Promise<Product[]> {
    if (products.length === 0) {
      return products;
    }

    const productIds = products.map((product) => product.product_id);
    const countryMap = await this.getProductCountrySetMap(productIds);

    return products.map((product) => ({
      ...product,
      country_codes: [...(countryMap.get(product.product_id) ?? new Set<string>())].sort(),
    }));
  }

  private mapPublicStorefrontProduct(product: Product, store: Store, inventoryAvailabilityMap: Map<number, number>): PublicStorefrontProduct {
    const flatMediaUrls = this.getFlatMediaUrls(product);
    const mediaUrls = flatMediaUrls;

    const variants = (product.variants ?? []).map((variant) => {
      const inventoryAvailable = variant.inventory_item_id != null ? inventoryAvailabilityMap.get(variant.inventory_item_id) : undefined;

      return {
        variant_id: variant.variant_id,
        title: this.toPublicVariantTitle(variant),
        sku: variant.sku,
        option1_value: variant.option1_value,
        option2_value: variant.option2_value,
        option3_value: variant.option3_value,
        price: variant.price != null ? String(variant.price) : undefined,
        compare_at_price: variant.compare_at_price != null ? String(variant.compare_at_price) : undefined,
        media_urls: Array.isArray(variant.media_urls) ? variant.media_urls : undefined,
        inventory_available: inventoryAvailable,
      };
    });

    const options = (product.options ?? []).map((option) => ({
      name: option.name,
      values: [...(option.values ?? [])].sort((a, b) => a.position - b.position).map((value) => value.value),
    }));

    const pricedVariants = [...(product.variants ?? [])].filter((variant) => variant.price != null).sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    const defaultVariant = pricedVariants[0] ?? (product.variants ?? [])[0];

    return {
      product_id: product.product_id,
      store_id: store.store_id,
      store_name: store.name,
      title: product.title,
      brand: product.brand,
      description: product.description,
      handle: product.handle ?? String(product.product_id),
      image_url: this.selectPrimaryImage(mediaUrls, product.primary_image_url ?? product.og_image),
      media_urls: mediaUrls,
      price: defaultVariant?.price != null ? String(defaultVariant.price) : undefined,
      compare_at_price: defaultVariant?.compare_at_price != null ? String(defaultVariant.compare_at_price) : undefined,
      options,
      variants,
    };
  }

  private mapPublicStorefrontProductSummary(product: Product, store: Store): PublicStorefrontProduct {
    const flatMediaUrls = this.getFlatMediaUrls(product);
    const mediaUrls = flatMediaUrls;

    const variants = (product.variants ?? []).map((variant) => ({
      variant_id: variant.variant_id,
      title: this.toPublicVariantTitle(variant),
      sku: variant.sku,
      option1_value: variant.option1_value,
      option2_value: variant.option2_value,
      option3_value: variant.option3_value,
      price: variant.price != null ? String(variant.price) : undefined,
      compare_at_price: variant.compare_at_price != null ? String(variant.compare_at_price) : undefined,
      media_urls: Array.isArray(variant.media_urls) ? variant.media_urls : undefined,
      inventory_available: undefined,
    }));

    const pricedVariants = [...(product.variants ?? [])].filter((variant) => variant.price != null).sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    const defaultVariant = pricedVariants[0] ?? (product.variants ?? [])[0];

    return {
      product_id: product.product_id,
      store_id: store.store_id,
      store_name: store.name,
      title: product.title,
      brand: product.brand,
      description: product.description,
      handle: product.handle ?? String(product.product_id),
      image_url: this.selectPrimaryImage(mediaUrls, product.primary_image_url ?? product.og_image),
      media_urls: mediaUrls,
      price: defaultVariant?.price != null ? String(defaultVariant.price) : undefined,
      compare_at_price: defaultVariant?.compare_at_price != null ? String(defaultVariant.compare_at_price) : undefined,
      options: [],
      variants,
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

  async findAvailableCountriesByStore(storeId: number): Promise<string[]> {
    await this.findStore(storeId);

    const cached = this.getCachedAvailableCountries(storeId);
    if (cached !== undefined) {
      return cached;
    }

    const configuredRows = await this.productCountryAvailabilityRepo
      .createQueryBuilder('availability')
      .where('availability.store_id = :storeId', { storeId })
      .andWhere('availability.product_id IS NULL')
      .andWhere('availability.is_available = true')
      .select('DISTINCT availability.country_code', 'country_code')
      .orderBy('availability.country_code', 'ASC')
      .getRawMany<{ country_code: string }>();

    const configuredCountries = this.normalizeCountryCodes(configuredRows.map((row) => row.country_code)) ?? [];

    if (configuredCountries.length > 0) {
      this.setCachedAvailableCountries(storeId, configuredCountries);
      return configuredCountries;
    }

    const indexedCountries = await this.loadAvailableCountriesByStoreFromSearchIndex(storeId);
    if (indexedCountries) {
      this.setCachedAvailableCountries(storeId, indexedCountries);
      return indexedCountries;
    }

    const rows = await this.productCountryAvailabilityRepo
      .createQueryBuilder('availability')
      .innerJoin(Product, 'product', 'product.product_id = availability.product_id')
      .where('availability.store_id = :storeId', { storeId })
      .andWhere('availability.product_id IS NOT NULL')
      .andWhere('availability.is_available = true')
      .andWhere('product.status = :status', { status: ProductStatus.ACTIVE })
      .select('DISTINCT availability.country_code', 'country_code')
      .orderBy('availability.country_code', 'ASC')
      .getRawMany<{ country_code: string }>();

    const resolved = this.normalizeCountryCodes(rows.map((row) => row.country_code)) ?? [];
    this.setCachedAvailableCountries(storeId, resolved);
    return resolved;
  }

  async setStoreCountries(input: SetStoreCountriesInput, actor?: User): Promise<string[]> {
    const storeId = input.store_id;
    await this.findStore(storeId, actor);

    const normalizedCountryCodes = this.normalizeCountryCodes(input.country_codes) ?? [];

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ProductCountryAvailability, {
        store_id: storeId,
        product_id: IsNull(),
      });

      if (normalizedCountryCodes.length === 0) {
        return;
      }

      await manager.save(
        ProductCountryAvailability,
        normalizedCountryCodes.map((countryCode) =>
          manager.create(ProductCountryAvailability, {
            store_id: storeId,
            product_id: null,
            country_code: countryCode,
            is_available: true,
          }),
        ),
      );
    });

    this.invalidatePublicCaches();
    return normalizedCountryCodes;
  }

  private async syncProductCountryAvailability(manager: EntityManager, storeId: number, productId: number, countryCodes: string[] | undefined): Promise<void> {
    if (countryCodes === undefined) {
      return;
    }

    await manager.delete(ProductCountryAvailability, {
      product_id: productId,
    });

    if (countryCodes.length === 0) {
      return;
    }

    await manager.save(
      ProductCountryAvailability,
      countryCodes.map((countryCode) =>
        manager.create(ProductCountryAvailability, {
          store_id: storeId,
          product_id: productId,
          country_code: countryCode,
          is_available: true,
        }),
      ),
    );
  }

  async findPublicStorefrontData(storeLimit = 6, productLimit = 8, countryCode?: string): Promise<PublicStorefrontStore[]> {
    const normalizedStoreLimit = Math.max(1, Math.min(storeLimit, 20));
    const normalizedProductLimit = Math.max(1, Math.min(productLimit, 20));
    const normalizedCountryCode = this.normalizeCountryCode(countryCode) ?? '';
    const cacheKey = `${normalizedStoreLimit}:${normalizedProductLimit}:${normalizedCountryCode}`;

    const cached = this.getCachedPublicStores(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.publicStoresInflight.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = this.loadPublicStorefrontDataFromSearchIndex(normalizedStoreLimit, normalizedProductLimit, normalizedCountryCode || undefined)
      .then((indexedResult) => {
        if (indexedResult) {
          return indexedResult;
        }

        return this.loadPublicStorefrontData(normalizedStoreLimit, normalizedProductLimit, normalizedCountryCode || undefined);
      })
      .then((result) => {
        this.setCachedPublicStores(cacheKey, result);
        return result;
      })
      .finally(() => {
        this.publicStoresInflight.delete(cacheKey);
      });

    this.publicStoresInflight.set(cacheKey, pending);
    return pending;
  }

  private async loadPublicStorefrontData(
    normalizedStoreLimit: number,
    normalizedProductLimit: number,
    normalizedCountryCode?: string,
  ): Promise<PublicStorefrontStore[]> {
    const stores = await this.storeRepo.find({
      order: { created_at: 'DESC' },
      take: normalizedStoreLimit,
    });

    if (stores.length === 0) {
      return [];
    }

    const productsPerStore = await Promise.all(
      stores.map(async (store) => ({
        store_id: store.store_id,
        products: await this.productRepo.find({
          where: {
            store_id: store.store_id,
            status: ProductStatus.ACTIVE,
          },
          relations: {
            variants: true,
          },
          order: {
            published_at: 'DESC',
            created_at: 'DESC',
          },
          take: normalizedCountryCode ? normalizedProductLimit * 3 : normalizedProductLimit,
        }),
      })),
    );

    const products = productsPerStore.flatMap((entry) => entry.products);
    if (products.length === 0) {
      return stores.map((store) => ({
        store_id: store.store_id,
        name: store.name,
        products: [],
      }));
    }

    const productsByStore = new Map<number, Product[]>(productsPerStore.map((entry) => [entry.store_id, entry.products]));

    const productCountrySetMap = normalizedCountryCode
      ? await this.getProductCountrySetMap(products.map((product) => product.product_id))
      : new Map<number, Set<string>>();

    return stores.map((store) => {
      const rawStoreProducts = productsByStore.get(store.store_id) ?? [];
      const storeProducts = normalizedCountryCode
        ? rawStoreProducts
            .filter((product) => this.isProductAvailableForCountry(product, normalizedCountryCode, productCountrySetMap))
            .slice(0, normalizedProductLimit)
        : rawStoreProducts;

      return {
        store_id: store.store_id,
        name: store.name,
        products: storeProducts.map((product) => this.mapPublicStorefrontProductSummary(product, store)),
      };
    });
  }

  private normalizeStoreSlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async findStoreByNormalizedSlug(normalizedSlug: string): Promise<Pick<Store, 'store_id' | 'name'> | null> {
    const indexedMatch = await this.storeRepo.findOne({
      where: { slug: normalizedSlug },
      select: {
        store_id: true,
        name: true,
      },
      order: { created_at: 'DESC' },
    });

    if (indexedMatch) {
      return {
        store_id: indexedMatch.store_id,
        name: indexedMatch.name,
      };
    }

    const store = await this.storeRepo
      .createQueryBuilder('store')
      .select(['store.store_id AS store_id', 'store.name AS name'])
      .where("store.slug IS NULL AND trim(both '-' from regexp_replace(lower(store.name), '[^a-z0-9]+', '-', 'g')) = :slug", { slug: normalizedSlug })
      .orderBy('store.created_at', 'DESC')
      .limit(1)
      .getRawOne<{ store_id: number | string; name: string }>();

    if (!store) {
      return null;
    }

    return {
      store_id: Number(store.store_id),
      name: store.name,
    };
  }

  private getCachedPublicStoreBySlug(cacheKey: string): PublicStorefrontStore | null | undefined {
    const cacheEntry = this.publicStoreBySlugCache.get(cacheKey);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.publicStoreBySlugCache.delete(cacheKey);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedPublicStoreBySlug(cacheKey: string, value: PublicStorefrontStore | null): void {
    this.publicStoreBySlugCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ProductService.PUBLIC_STORES_CACHE_TTL_MS,
    });
  }

  private async loadPublicStorefrontStoreByIdFromSearchIndex(
    storeId: number,
    normalizedProductLimit: number,
    normalizedCountryCode?: string,
  ): Promise<PublicStorefrontStore | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    await this.ensureProductDetailIndex();

    try {
      // Build filter clauses for ES filter context (enables query caching)
      const filterClauses: Record<string, unknown>[] = [{ term: { store_id: storeId } }, { term: { status: ProductStatus.ACTIVE } }];

      if (normalizedCountryCode) {
        filterClauses.push({
          bool: {
            should: [{ term: { country_codes: normalizedCountryCode } }, { bool: { must_not: { exists: { field: 'country_codes' } } } }],
            minimum_should_match: 1,
          },
        });
      }

      // Query ES directly with store_id filter - no DB round trip needed
      const response = await this.esClient.search<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        size: normalizedProductLimit,
        track_total_hits: false,
        _source: ['product_id', 'store_id', 'store_name', 'title', 'brand', 'handle', 'image_url', 'price', 'compare_at_price', 'variants', 'options'],
        sort: [{ updated_at: { order: 'desc' } }, { product_id: { order: 'desc' } }],
        query: {
          bool: {
            filter: filterClauses,
          },
        },
      });

      const products: PublicStorefrontProduct[] = [];
      let resolvedStoreName: string | undefined;

      for (const hit of response.hits.hits) {
        const source = hit._source;
        if (!source) continue;

        resolvedStoreName = resolvedStoreName ?? source.store_name;
        products.push(this.mapIndexedDocumentToPublicProductSummary(source));
      }

      // If no products found in ES, check if store exists
      if (resolvedStoreName == null) {
        const store = await this.storeRepo.findOne({
          where: { store_id: storeId },
          select: { store_id: true, name: true },
        });

        if (!store) return null;

        return {
          store_id: store.store_id,
          name: store.name,
          products: [],
        };
      }

      return {
        store_id: storeId,
        name: resolvedStoreName,
        products,
      };
    } catch (error) {
      console.error('Failed to fetch public storefront store ' + storeId + ' from Elasticsearch:', error);
      return null;
    }
  }

  private async loadPublicStorefrontStoreBySlugFromSearchIndex(
    normalizedSlug: string,
    normalizedProductLimit: number,
    normalizedCountryCode?: string,
  ): Promise<PublicStorefrontStore | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    await this.ensureProductDetailIndex();

    try {
      // Build filter clauses for ES filter context (enables query caching)
      const filterClauses: Record<string, unknown>[] = [{ term: { store_slug: normalizedSlug } }, { term: { status: ProductStatus.ACTIVE } }];

      if (normalizedCountryCode) {
        filterClauses.push({
          bool: {
            should: [{ term: { country_codes: normalizedCountryCode } }, { bool: { must_not: { exists: { field: 'country_codes' } } } }],
            minimum_should_match: 1,
          },
        });
      }

      // Query ES directly by store_slug - no DB round trip needed
      const response = await this.esClient.search<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        size: normalizedProductLimit,
        track_total_hits: false,
        _source: ['product_id', 'store_id', 'store_name', 'title', 'brand', 'handle', 'image_url', 'price', 'compare_at_price', 'variants', 'options'],
        sort: [{ updated_at: { order: 'desc' } }, { product_id: { order: 'desc' } }],
        query: {
          bool: {
            filter: filterClauses,
          },
        },
      });

      const products: PublicStorefrontProduct[] = [];
      let resolvedStoreId: number | undefined;
      let resolvedStoreName: string | undefined;

      for (const hit of response.hits.hits) {
        const source = hit._source;
        if (!source) continue;

        resolvedStoreId = resolvedStoreId ?? source.store_id;
        resolvedStoreName = resolvedStoreName ?? source.store_name;
        products.push(this.mapIndexedDocumentToPublicProductSummary(source));
      }

      // No products found with this slug - let caller fall back to DB
      if (resolvedStoreId == null || resolvedStoreName == null) {
        return null;
      }

      return {
        store_id: resolvedStoreId,
        name: resolvedStoreName,
        products,
      };
    } catch (error) {
      console.error('Failed to fetch public storefront store by slug ' + normalizedSlug + ' from Elasticsearch:', error);
      return null;
    }
  }

  private async loadPublicStorefrontStoreById(
    storeId: number,
    normalizedProductLimit: number,
    normalizedCountryCode?: string,
  ): Promise<PublicStorefrontStore | null> {
    const store = await this.storeRepo.findOne({ where: { store_id: storeId } });
    if (!store) {
      return null;
    }

    const rawProducts = await this.productRepo.find({
      where: {
        store_id: storeId,
        status: ProductStatus.ACTIVE,
      },
      relations: {
        variants: true,
      },
      order: {
        published_at: 'DESC',
        created_at: 'DESC',
      },
      take: normalizedCountryCode ? normalizedProductLimit * 3 : normalizedProductLimit,
    });

    if (rawProducts.length === 0) {
      return {
        store_id: store.store_id,
        name: store.name,
        products: [],
      };
    }

    const productCountrySetMap = normalizedCountryCode
      ? await this.getProductCountrySetMap(rawProducts.map((product) => product.product_id))
      : new Map<number, Set<string>>();

    const filteredProducts = normalizedCountryCode
      ? rawProducts
          .filter((product) => this.isProductAvailableForCountry(product, normalizedCountryCode, productCountrySetMap))
          .slice(0, normalizedProductLimit)
      : rawProducts;

    return {
      store_id: store.store_id,
      name: store.name,
      products: filteredProducts.map((product) => this.mapPublicStorefrontProductSummary(product, store)),
    };
  }

  async findPublicStorefrontStoreBySlug(slug: string, productLimit = 8, countryCode?: string): Promise<PublicStorefrontStore | null> {
    const normalizedSlug = this.normalizeStoreSlug(slug ?? '');
    if (!normalizedSlug) {
      return null;
    }

    const normalizedProductLimit = Math.max(1, Math.min(productLimit, 20));
    const normalizedCountryCode = this.normalizeCountryCode(countryCode) ?? '';
    const cacheKey = `${normalizedSlug}:${normalizedProductLimit}:${normalizedCountryCode}`;

    const cached = this.getCachedPublicStoreBySlug(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.publicStoreBySlugInflight.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = this.loadPublicStorefrontStoreBySlugFromSearchIndex(normalizedSlug, normalizedProductLimit, normalizedCountryCode || undefined)
      .then(async (indexedStore) => {
        if (indexedStore) {
          return indexedStore;
        }

        // Fallback to DB lookup if ES returns nothing
        const store = await this.findStoreByNormalizedSlug(normalizedSlug);
        if (!store) {
          return null;
        }

        return this.loadPublicStorefrontStoreById(store.store_id, normalizedProductLimit, normalizedCountryCode || undefined);
      })
      .then((result) => {
        this.setCachedPublicStoreBySlug(cacheKey, result);
        return result;
      })
      .finally(() => {
        this.publicStoreBySlugInflight.delete(cacheKey);
      });

    this.publicStoreBySlugInflight.set(cacheKey, pending);
    return pending;
  }

  async findPublicProductByHandle(handle: string, countryCode?: string): Promise<PublicStorefrontProduct | null> {
    const normalizedHandle = (handle ?? '').trim();
    if (!normalizedHandle) {
      return null;
    }

    const normalizedCountryCode = this.normalizeCountryCode(countryCode) ?? '';

    const cacheKey = `${normalizedHandle.toLowerCase()}:${normalizedCountryCode}`;
    const cached = this.getCachedPublicProduct(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.publicProductInflight.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = this.loadPublicProductByHandleFromSearchIndex(normalizedHandle, normalizedCountryCode || undefined)
      .then(async (indexedResult) => {
        if (indexedResult) {
          return indexedResult;
        }

        const dbResult = await this.loadPublicProductByHandle(normalizedHandle, normalizedCountryCode || undefined);
        if (dbResult) {
          void this.syncPublicProductToSearchIndex(dbResult.handle).catch((error) => {
            console.error('Failed to warm Elasticsearch for product ' + dbResult.handle + ':', error);
          });
        }

        return dbResult;
      })
      .then((result) => {
        this.setCachedPublicProduct(cacheKey, result);
        return result;
      })
      .finally(() => {
        this.publicProductInflight.delete(cacheKey);
      });

    this.publicProductInflight.set(cacheKey, pending);
    return pending;
  }

  private async searchPublicProductsFromSearchIndex(
    normalizedQuery: string,
    normalizedLimit: number,
    normalizedCountryCode?: string,
    normalizedStoreId?: number,
    normalizedStoreSlug?: string,
  ): Promise<PublicStorefrontProduct[] | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    await this.ensureProductDetailIndex();

    try {
      const filterClauses: Record<string, unknown>[] = [{ term: { status: ProductStatus.ACTIVE } }];

      if (normalizedStoreId) {
        filterClauses.push({ term: { store_id: normalizedStoreId } });
      } else if (normalizedStoreSlug) {
        filterClauses.push({ term: { store_slug: normalizedStoreSlug } });
      }

      if (normalizedCountryCode) {
        filterClauses.push({
          bool: {
            should: [{ term: { country_codes: normalizedCountryCode } }, { bool: { must_not: { exists: { field: 'country_codes' } } } }],
            minimum_should_match: 1,
          },
        });
      }

      const normalizedHandleQuery = normalizedQuery
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '*')
        .replace(/^\*+|\*+$/g, '');

      const handleWildcardValue = normalizedHandleQuery ? `${normalizedHandleQuery}*` : undefined;

      const shouldClauses: Record<string, unknown>[] = [
        {
          multi_match: {
            query: normalizedQuery,
            fields: ['title^4', 'brand^2', 'description', 'handle^3'],
            type: 'best_fields',
            operator: 'or',
          },
        },
        {
          multi_match: {
            query: normalizedQuery,
            fields: ['title^5', 'brand^2', 'handle^4'],
            type: 'phrase_prefix',
            max_expansions: 40,
          },
        },
        {
          multi_match: {
            query: normalizedQuery,
            fields: ['title^5', 'brand^2', 'handle^4', 'description'],
            type: 'best_fields',
            fuzziness: 'AUTO',
            prefix_length: 1,
          },
        },
      ];

      if (handleWildcardValue) {
        shouldClauses.push({
          wildcard: {
            handle_lower: {
              value: handleWildcardValue,
              case_insensitive: true,
            },
          },
        });
      }

      const response = await this.esClient.search<IndexedPublicProductDocument>({
        index: this.esProductDetailIndex,
        size: normalizedLimit,
        track_total_hits: false,
        _source: [
          'product_id',
          'store_id',
          'store_name',
          'title',
          'brand',
          'description',
          'handle',
          'image_url',
          'media_urls',
          'price',
          'compare_at_price',
          'variants',
        ],
        query: {
          bool: {
            filter: filterClauses,
            must: [
              {
                bool: {
                  should: shouldClauses,
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        sort: [{ _score: { order: 'desc' } }, { updated_at: { order: 'desc' } }, { product_id: { order: 'desc' } }],
      });

      return response.hits.hits
        .map((hit) => hit._source)
        .filter((source): source is IndexedPublicProductDocument => Boolean(source))
        .map((source) => this.mapIndexedDocumentToPublicProductSummary(source));
    } catch (error) {
      console.error('Failed to search public products from Elasticsearch:', error);
      return null;
    }
  }

  private async searchPublicProductsFromDatabase(
    normalizedQuery: string,
    normalizedLimit: number,
    normalizedCountryCode?: string,
    normalizedStoreId?: number,
  ): Promise<PublicStorefrontProduct[]> {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.store', 'store')
      .leftJoinAndSelect('product.variants', 'variants')
      .where('product.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere(
        new Brackets((queryBuilder) => {
          queryBuilder
            .where('product.title ILIKE :query', { query: `%${normalizedQuery}%` })
            .orWhere('product.description ILIKE :query', { query: `%${normalizedQuery}%` })
            .orWhere('product.brand ILIKE :query', { query: `%${normalizedQuery}%` })
            .orWhere('product.handle ILIKE :query', { query: `%${normalizedQuery}%` });
        }),
      )
      .orderBy('product.updated_at', 'DESC')
      .addOrderBy('product.product_id', 'DESC')
      .take(normalizedLimit);

    if (normalizedStoreId) {
      qb.andWhere('product.store_id = :storeId', { storeId: normalizedStoreId });
    }

    const products = await qb.getMany();
    if (products.length === 0) {
      return [];
    }

    let filtered = products;
    if (normalizedCountryCode) {
      const productCountrySetMap = await this.getProductCountrySetMap(products.map((product) => product.product_id));
      filtered = products.filter((product) => this.isProductAvailableForCountry(product, normalizedCountryCode, productCountrySetMap));
    }

    return filtered
      .slice(0, normalizedLimit)
      .filter((product): product is Product & { store: Store } => Boolean(product.store))
      .map((product) => this.mapPublicStorefrontProductSummary(product, product.store));
  }

  async searchPublicProducts(query: string, limit = 24, countryCode?: string, storeSlug?: string, storeId?: number): Promise<PublicStorefrontProduct[]> {
    const normalizedQuery = (query ?? '').trim();
    if (normalizedQuery.length < 2) {
      return [];
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 60));
    const normalizedCountryCode = this.normalizeCountryCode(countryCode);
    const normalizedStoreSlug = (storeSlug ?? '').trim() ? this.normalizeStoreSlug(storeSlug ?? '') : undefined;
    let normalizedStoreId = Number.isInteger(storeId) && (storeId ?? 0) > 0 ? storeId : undefined;

    if (!normalizedStoreId && normalizedStoreSlug) {
      const matchedStore = await this.findStoreByNormalizedSlug(normalizedStoreSlug);
      if (!matchedStore) {
        return [];
      }

      normalizedStoreId = matchedStore.store_id;
    }

    const indexedResults = await this.searchPublicProductsFromSearchIndex(
      normalizedQuery,
      normalizedLimit,
      normalizedCountryCode,
      normalizedStoreId,
      normalizedStoreSlug,
    );

    if (indexedResults) {
      return indexedResults;
    }

    return this.searchPublicProductsFromDatabase(normalizedQuery, normalizedLimit, normalizedCountryCode, normalizedStoreId);
  }

  async findCategories(storeId?: number, actor?: User): Promise<Category[]> {
    void storeId;
    void actor;

    const categories = await this.categoryRepo.find({
      order: { name: 'ASC' },
    });

    return categories.map((category) => this.serializeCategoryForGraphQL(category));
  }

  private serializeCategoryForGraphQL(category: Category): Category {
    const metadata = category.metadata;

    return {
      ...category,
      metadata:
        metadata == null
          ? null
          : typeof metadata === 'string'
            ? (metadata as unknown as Record<string, unknown>)
            : (JSON.stringify(metadata) as unknown as Record<string, unknown>),
    };
  }

  private normalizeCategoryMetadata(metadata: Category['metadata']): Record<string, unknown> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    return { ...(metadata as Record<string, unknown>) };
  }

  private normalizeCategoryMetafieldDefinitions(
    source: CreateCategoryInput['metafields'] | UpdateCategoryInput['metafields'] | unknown,
  ): Array<{ key: string; label: string; type: 'text' | 'textarea' }> {
    if (!Array.isArray(source)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: Array<{ key: string; label: string; type: 'text' | 'textarea' }> = [];

    for (const entry of source) {
      const keyRaw = (entry as { key?: unknown })?.key;
      const labelRaw = (entry as { label?: unknown })?.label;
      const typeRaw = (entry as { type?: unknown })?.type;

      const key = this.normalizeCategorySlug(String(keyRaw ?? '').replace(/-/g, '_'));
      if (!key) {
        continue;
      }

      const dedupe = key.toLowerCase();
      if (seen.has(dedupe)) {
        continue;
      }

      seen.add(dedupe);
      normalized.push({
        key,
        label: String(labelRaw ?? '').trim() || key,
        type: String(typeRaw ?? '').toLowerCase() === 'textarea' ? 'textarea' : 'text',
      });
    }

    return normalized;
  }

  private mergeCategoryMetafieldDefinitions(
    existing: Array<{ key: string; label: string; type: 'text' | 'textarea' }>,
    incoming: Array<{ key: string; label: string; type: 'text' | 'textarea' }>,
  ): Array<{ key: string; label: string; type: 'text' | 'textarea' }> {
    const merged = [...existing];

    for (const candidate of incoming) {
      const dedupe = candidate.key.toLowerCase();
      const found = merged.findIndex((entry) => entry.key.toLowerCase() === dedupe);
      if (found >= 0) {
        merged[found] = candidate;
      } else {
        merged.push(candidate);
      }
    }

    return merged;
  }

  private getCategoryOwnerUserId(category: Category): number | undefined {
    const normalized = this.normalizeCategoryMetadata(category.metadata);

    const raw = normalized.owner_user_id;
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }

    return undefined;
  }

  private buildCategoryMetadata(
    metadata: Category['metadata'],
    ownerUserId?: number,
    metafields?: Array<{ key: string; label: string; type: 'text' | 'textarea' }>,
  ): Record<string, unknown> {
    const normalized = this.normalizeCategoryMetadata(metadata);

    if (ownerUserId && Number.isInteger(ownerUserId) && ownerUserId > 0) {
      normalized.owner_user_id = ownerUserId;
    }

    if (metafields !== undefined) {
      normalized.metafields = this.normalizeCategoryMetafieldDefinitions(metafields);
    }

    return normalized;
  }

  private slugToCategoryName(slug: string): string {
    const parts = this.normalizeCategorySlug(slug)
      .split('-')
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      return 'New Category';
    }

    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  private inferCategoryMetafieldsFromOptions(optionNames: string[]): Array<{ key: string; label: string; type: 'text' | 'textarea' }> {
    return this.normalizeCategoryMetafieldDefinitions(
      optionNames.map((name) => ({
        key: this.normalizeCategorySlug(name).replace(/-/g, '_'),
        label: name.trim(),
        type: 'text',
      })),
    );
  }

  private buildProductMetafieldsFromCategories(categories: Category[]): Array<{ key: string; value?: string }> {
    const defs = categories.flatMap((category) => this.normalizeCategoryMetafieldDefinitions(this.normalizeCategoryMetadata(category.metadata).metafields));

    const seen = new Set<string>();
    const entries: Array<{ key: string; value?: string }> = [];

    for (const def of defs) {
      const key = String(def.key ?? '').trim();
      if (!key) {
        continue;
      }

      const dedupe = key.toLowerCase();
      if (seen.has(dedupe)) {
        continue;
      }

      seen.add(dedupe);
      entries.push({ key, value: undefined });
    }

    return entries;
  }

  private async resolveImportCategoriesForStore(
    categorySlugs: string[],
    ownerUserId: number,
    inferredMetafields: Array<{ key: string; label: string; type: 'text' | 'textarea' }>,
    logContext?: string,
  ): Promise<Category[]> {
    const uniqueSlugs = [...new Set(categorySlugs.map((slug) => this.normalizeCategorySlug(slug)).filter((slug) => slug.length > 0))];
    const resolved: Category[] = [];

    for (const slug of uniqueSlugs) {
      let category = await this.categoryRepo.findOne({ where: { slug } });
      if (category) {
        const existingMetafields = this.normalizeCategoryMetafieldDefinitions(this.normalizeCategoryMetadata(category.metadata).metafields);
        const mergedMetafields = this.mergeCategoryMetafieldDefinitions(existingMetafields, inferredMetafields);
        const previousOwnerId = this.getCategoryOwnerUserId(category);
        const ownerId = previousOwnerId ?? ownerUserId;

        category.metadata = this.buildCategoryMetadata(category.metadata, ownerId, mergedMetafields);

        if (ownerId !== previousOwnerId || mergedMetafields.length !== existingMetafields.length) {
          category = await this.categoryRepo.save(category);
          this.logger.log(`${logContext ?? '[category-import]'} enriched category slug=${slug} categoryId=${category.category_id} ownerUserId=${ownerId}`);
        }

        resolved.push(category);
        continue;
      }

      const payload = this.categoryRepo.create({
        name: this.slugToCategoryName(slug),
        slug,
        parent_id: null,
        metadata: this.buildCategoryMetadata(undefined, ownerUserId, inferredMetafields),
      });

      try {
        category = await this.categoryRepo.save(payload);
      } catch (error) {
        if (error instanceof QueryFailedError && String(error.message).includes('PK_51615bef2cea22812d0dcab6e18')) {
          await this.syncIdSequence('Category', 'category_id');
          category = await this.categoryRepo.save(payload);
        } else if (error instanceof QueryFailedError && String(error.message).toLowerCase().includes('duplicate key value')) {
          const existing = await this.categoryRepo.findOne({ where: { slug } });
          if (!existing) {
            throw error;
          }

          const existingMetafields = this.normalizeCategoryMetafieldDefinitions(this.normalizeCategoryMetadata(existing.metadata).metafields);
          const mergedMetafields = this.mergeCategoryMetafieldDefinitions(existingMetafields, inferredMetafields);
          existing.metadata = this.buildCategoryMetadata(existing.metadata, this.getCategoryOwnerUserId(existing) ?? ownerUserId, mergedMetafields);
          category = await this.categoryRepo.save(existing);
        } else {
          throw error;
        }
      }

      this.logger.log(`${logContext ?? '[category-import]'} created category slug=${slug} categoryId=${category.category_id} ownerUserId=${ownerUserId}`);
      resolved.push(category);
    }

    return resolved;
  }

  private normalizeCategorySlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async createCategory(input: CreateCategoryInput, actor?: User): Promise<Category> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    const slug = this.normalizeCategorySlug(input.slug || input.name);
    if (!slug) {
      throw new BadRequestException('Category slug cannot be empty');
    }

    const existing = await this.categoryRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Category with slug "${slug}" already exists`);
    }

    if (input.parent_id != null) {
      const parent = await this.categoryRepo.findOne({ where: { category_id: input.parent_id } });
      if (!parent) {
        throw new NotFoundException(`Parent category with ID ${input.parent_id} not found`);
      }
    }

    const normalizedMetafields = this.normalizeCategoryMetafieldDefinitions(input.metafields);

    const payload = this.categoryRepo.create({
      name: input.name.trim(),
      slug,
      parent_id: input.parent_id ?? null,
      metadata: this.buildCategoryMetadata(undefined, actor.id, normalizedMetafields),
    });

    try {
      const saved = await this.categoryRepo.save(payload);
      return this.serializeCategoryForGraphQL(saved);
    } catch (error) {
      // If the identity/sequence is out of sync, re-align and retry once.
      if (error instanceof QueryFailedError && String(error.message).includes('PK_51615bef2cea22812d0dcab6e18')) {
        await this.syncIdSequence('Category', 'category_id');
        const saved = await this.categoryRepo.save(payload);
        return this.serializeCategoryForGraphQL(saved);
      }

      throw error;
    }
  }

  private async syncIdSequence(tableName: string, columnName: string): Promise<void> {
    const maxRes = await this.dataSource.query(`SELECT COALESCE(MAX("${columnName}"), 0)::int AS max_id FROM public."${tableName}"`);
    const maxValue = Number(maxRes[0]?.max_id || 0);

    const seqRes = await this.dataSource.query(`SELECT pg_get_serial_sequence('public."${tableName}"', '${columnName}') AS seq`);
    const seqName = seqRes[0]?.seq as string | null;

    if (!seqName) {
      return;
    }

    // `is_called = true` means next nextval() returns max + 1.
    await this.dataSource.query('SELECT setval($1, $2, true)', [seqName, maxValue]);
  }

  async updateCategory(id: number, input: UpdateCategoryInput, actor?: User): Promise<Category> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    const category = await this.categoryRepo.findOne({ where: { category_id: id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const ownerId = this.getCategoryOwnerUserId(category);
    if (ownerId && ownerId !== actor.id) {
      throw new ForbiddenException('Only the category owner can update this category');
    }

    if (input.name !== undefined) {
      category.name = input.name.trim();
    }

    if (input.slug !== undefined) {
      const slug = this.normalizeCategorySlug(input.slug);
      if (!slug) {
        throw new BadRequestException('Category slug cannot be empty');
      }

      const duplicate = await this.categoryRepo.findOne({ where: { slug } });
      if (duplicate && duplicate.category_id !== id) {
        throw new ConflictException(`Category with slug "${slug}" already exists`);
      }
      category.slug = slug;
    }

    if (input.parent_id !== undefined) {
      if (input.parent_id === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }

      if (input.parent_id != null) {
        const parent = await this.categoryRepo.findOne({ where: { category_id: input.parent_id } });
        if (!parent) {
          throw new NotFoundException(`Parent category with ID ${input.parent_id} not found`);
        }
      }

      category.parent_id = input.parent_id ?? null;
    }

    if (input.metafields !== undefined) {
      const normalizedMetafields = this.normalizeCategoryMetafieldDefinitions(input.metafields);
      category.metadata = this.buildCategoryMetadata(category.metadata, ownerId ?? actor.id, normalizedMetafields);
    } else if (!ownerId) {
      category.metadata = this.buildCategoryMetadata(category.metadata, actor.id);
    }

    const saved = await this.categoryRepo.save(category);
    return this.serializeCategoryForGraphQL(saved);
  }

  async deleteCategory(id: number, actor?: User): Promise<boolean> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    const existing = await this.categoryRepo.findOne({ where: { category_id: id } });
    if (!existing) {
      return false;
    }

    const ownerId = this.getCategoryOwnerUserId(existing);
    if (ownerId && ownerId !== actor.id) {
      throw new ForbiddenException('Only the category owner can delete this category');
    }

    if (!ownerId) {
      existing.metadata = this.buildCategoryMetadata(existing.metadata, actor.id);
      await this.categoryRepo.save(existing);
    }

    await this.categoryRepo.delete({ category_id: id });
    return true;
  }

  private mapBrandRow(row: Record<string, unknown>): BrandRecordResponse {
    return {
      brand_id: Number(row.brand_id),
      store_id: Number(row.store_id),
      store_name: row.store_name ? String(row.store_name) : undefined,
      name: String(row.name ?? ''),
      slug: row.slug ? String(row.slug) : undefined,
      created_at: new Date(String(row.created_at)),
      updated_at: new Date(String(row.updated_at)),
    };
  }

  async findBrands(storeId: number | undefined, actor?: User): Promise<BrandRecordResponse[]> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);
    if (accessibleStoreIds && accessibleStoreIds.length === 0) {
      return [];
    }

    if (storeId && accessibleStoreIds && !accessibleStoreIds.includes(storeId)) {
      throw new ForbiddenException('You do not have access to this store');
    }

    await this.ensureBrandTable(this.dataSource.manager);

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (storeId) {
      params.push(storeId);
      conditions.push(`b."store_id" = $${params.length}`);
    }

    if (accessibleStoreIds) {
      params.push(accessibleStoreIds);
      conditions.push(`b."store_id" = ANY($${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.dataSource.query(
      `
        SELECT b.*, s."name" AS store_name
        FROM "Brand" b
        LEFT JOIN "Store" s ON s."store_id" = b."store_id"
        ${whereClause}
        ORDER BY b."name" ASC
      `,
      params,
    );

    return rows.map((row: Record<string, unknown>) => this.mapBrandRow(row));
  }

  async createBrand(input: CreateBrandInput, actor?: User): Promise<BrandRecordResponse> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    const store = await this.findStore(input.store_id, actor);
    const name = String(input.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('Brand name is required');
    }

    await this.ensureBrandTable(this.dataSource.manager);

    const duplicate = await this.dataSource.query(`SELECT 1 FROM "Brand" WHERE "store_id" = $1 AND LOWER("name") = LOWER($2) LIMIT 1`, [store.store_id, name]);
    if (duplicate.length > 0) {
      throw new ConflictException(`Brand '${name}' already exists for this store`);
    }

    const rows = await this.dataSource.query(
      `
        INSERT INTO "Brand" ("store_id", "name", "slug")
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [store.store_id, name, this.normalizeCategorySlug(name)],
    );

    const created = this.mapBrandRow(rows[0]);
    created.store_name = store.name;
    return created;
  }

  async updateBrand(input: UpdateBrandInput, actor?: User): Promise<BrandRecordResponse> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    await this.ensureBrandTable(this.dataSource.manager);

    const existingRows = await this.dataSource.query(`SELECT * FROM "Brand" WHERE "brand_id" = $1 LIMIT 1`, [input.brand_id]);
    if (existingRows.length === 0) {
      throw new NotFoundException(`Brand with ID ${input.brand_id} not found`);
    }

    const existing = existingRows[0] as Record<string, unknown>;
    const storeId = Number(existing.store_id);
    await this.findStore(storeId, actor);

    const nextName = input.name !== undefined ? String(input.name ?? '').trim() : String(existing.name ?? '').trim();
    if (!nextName) {
      throw new BadRequestException('Brand name cannot be empty');
    }

    const duplicate = await this.dataSource.query(
      `
        SELECT 1
        FROM "Brand"
        WHERE "store_id" = $1
          AND LOWER("name") = LOWER($2)
          AND "brand_id" != $3
        LIMIT 1
      `,
      [storeId, nextName, input.brand_id],
    );
    if (duplicate.length > 0) {
      throw new ConflictException(`Brand '${nextName}' already exists for this store`);
    }

    const updatedRows = await this.dataSource.query(
      `
        UPDATE "Brand"
        SET "name" = $1,
            "slug" = $2,
            "updated_at" = NOW()
        WHERE "brand_id" = $3
        RETURNING *
      `,
      [nextName, this.normalizeCategorySlug(nextName), input.brand_id],
    );

    return this.mapBrandRow(updatedRows[0]);
  }

  async deleteBrand(brandId: number, actor?: User): Promise<boolean> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    await this.ensureBrandTable(this.dataSource.manager);

    const existingRows = await this.dataSource.query(`SELECT * FROM "Brand" WHERE "brand_id" = $1 LIMIT 1`, [brandId]);
    if (existingRows.length === 0) {
      return false;
    }

    const existing = existingRows[0] as Record<string, unknown>;
    await this.findStore(Number(existing.store_id), actor);

    await this.dataSource.query(`DELETE FROM "Brand" WHERE "brand_id" = $1`, [brandId]);
    return true;
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

    this.invalidatePublicCaches();
    return this.findStore(store.store_id, actor);
  }

  async findAll(
    filter: ProductFilterInput = {},
    pagination: PaginationInput = {},
    actor?: User,
    hydration?: {
      includeCategories?: boolean;
      includeOptions?: boolean;
      includeMetafields?: boolean;
      includeCountryCodes?: boolean;
    },
  ): Promise<PaginatedProductsResponse> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * limit;
    const includeCategories = hydration?.includeCategories ?? true;
    const includeOptions = hydration?.includeOptions ?? true;
    const includeMetafields = hydration?.includeMetafields ?? true;
    const includeCountryCodes = hydration?.includeCountryCodes ?? true;
    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);

    if (accessibleStoreIds && accessibleStoreIds.length === 0) {
      return this.buildEmptyPage(page, limit);
    }

    if (accessibleStoreIds && filter.store_id && !accessibleStoreIds.includes(filter.store_id)) {
      return this.buildEmptyPage(page, limit);
    }

    // Admin listing intentionally uses DB-backed GraphQL only.
    // Do not route admin queries through Elasticsearch.

    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .orderBy('product.created_at', 'DESC')
      .addOrderBy('product.product_id', 'DESC')
      .skip(skip)
      .take(limit);

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
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM "ProductCategory" pc
          WHERE pc."product_id" = product."product_id"
            AND pc."category_id" = :categoryId
        )`,
        { categoryId: filter.category_id },
      );
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

    const productIds = items.map((item) => item.product_id);
    const [optionsByProductId, categoryLinksByProductId] =
      productIds.length > 0
        ? await Promise.all([
            includeOptions
              ? this.optionRepo
                  .find({
                    where: { product_id: In(productIds) },
                    relations: { values: true },
                    order: {
                      position: 'ASC',
                      values: { position: 'ASC' },
                    },
                  })
                  .then((rows) =>
                    rows.reduce<Map<number, ProductOption[]>>((acc, option) => {
                      const list = acc.get(option.product_id) ?? [];
                      list.push(option);
                      acc.set(option.product_id, list);
                      return acc;
                    }, new Map<number, ProductOption[]>()),
                  )
              : Promise.resolve(new Map<number, ProductOption[]>()),
            includeCategories
              ? this.productCategoryRepo
                  .find({
                    where: { product_id: In(productIds) },
                    relations: { category: true },
                  })
                  .then((rows) =>
                    rows.reduce<Map<number, ProductCategory[]>>((acc, link) => {
                      const list = acc.get(link.product_id) ?? [];
                      list.push(link);
                      acc.set(link.product_id, list);
                      return acc;
                    }, new Map<number, ProductCategory[]>()),
                  )
              : Promise.resolve(new Map<number, ProductCategory[]>()),
          ])
        : [new Map<number, ProductOption[]>(), new Map<number, ProductCategory[]>()];

    const mapped = items.map((item) => ({
      ...this.withProjectedFields(item),
      categories: includeCategories ? (categoryLinksByProductId.get(item.product_id) ?? []).map((link) => link.category) : undefined,
      options: includeOptions
        ? (optionsByProductId.get(item.product_id) ?? []).map((option) => ({
            ...option,
            values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
          }))
        : undefined,
    }));

    const mappedWithMetafields = includeMetafields ? await this.attachMetafields(mapped) : mapped;
    const mappedWithCountries = includeCountryCodes ? await this.attachCountryCodes(mappedWithMetafields) : mappedWithMetafields;

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: mappedWithCountries,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async findOne(productId: number, actor?: User, includeVariants = false): Promise<Product> {
    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);

    const product = await this.productRepo.findOne({ where: { product_id: productId } });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (accessibleStoreIds && !accessibleStoreIds.includes(product.store_id)) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const [options, categoryLinks, metafields, countryRows, variants] = await Promise.all([
      this.optionRepo.find({
        where: { product_id: product.product_id },
        relations: { values: true },
        order: { position: 'ASC', values: { position: 'ASC' } },
      }),
      this.productCategoryRepo.find({
        where: { product_id: product.product_id },
        relations: { category: true },
      }),
      this.metafieldRepo.find({
        where: {
          owner_type: 'product',
          owner_id: product.product_id,
        },
        order: { key: 'ASC' },
      }),
      this.productCountryAvailabilityRepo.find({
        where: {
          product_id: product.product_id,
          is_available: true,
        },
        order: { country_code: 'ASC' },
      }),
      includeVariants
        ? this.variantRepo.find({
            where: { product_id: product.product_id },
            relations: { inventory_item: { levels: true } },
            order: { is_default: 'DESC', variant_id: 'ASC' },
          })
        : Promise.resolve(undefined),
    ]);

    return {
      ...this.withProjectedFields(product),
      categories: categoryLinks.map((link) => link.category),
      options: options.map((option) => ({
        ...option,
        values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
      })),
      metafields,
      country_codes: this.normalizeCountryCodes(countryRows.map((row) => row.country_code)) ?? [],
      ...(includeVariants !== false ? { variants } : {}),
    };
  }

  async findByHandle(handle: string, actor?: User, includeVariants = false): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { handle } });
    if (!product) {
      throw new NotFoundException(`Product with handle '${handle}' not found`);
    }

    return this.findOne(product.product_id, actor, includeVariants);
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

    const maxRes = await manager.query(`SELECT COALESCE(MAX("${column}"), 0)::int AS max_id FROM public."${table}"`);
    const maxValue = Number(maxRes[0]?.max_id ?? 0);

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

      // `is_called = true` means next nextval() returns max + 1.
      await manager.query('SELECT setval($1, $2, true)', [seqName, maxValue]);
    }
  }

  async create(input: CreateProductInput, actor?: User): Promise<Product> {
    const normalizedInput = this.normalizeCreateInput(input);
    const { category_ids, seo, metafields, country_codes, ...productData } = normalizedInput;
    const normalizedSeo = this.normalizeSeoInput(seo);
    const normalizedMetafields = this.normalizeMetafieldsInput(metafields);
    const normalizedCountryCodes = this.normalizeCountryCodes(country_codes);

    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);
    if (accessibleStoreIds && !accessibleStoreIds.includes(productData.store_id)) {
      throw new ForbiddenException('You do not have access to this store');
    }

    const store = await this.storeRepo.findOne({ where: { store_id: productData.store_id } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${productData.store_id} not found`);
    }

    const result = await this.dataSource.transaction(async (manager) => {
      if (normalizedSeo?.handle) {
        const existingFlatHandle = await manager.findOne(Product, {
          where: { handle: normalizedSeo.handle },
        });

        if (existingFlatHandle) {
          throw new ConflictException(`SEO handle '${normalizedSeo.handle}' already exists`);
        }
      }

      const product = manager.create(Product, {
        ...productData,
        handle: normalizedSeo?.handle,
        meta_title: normalizedSeo?.meta_title,
        meta_description: normalizedSeo?.meta_description,
        og_title: normalizedSeo?.og_title,
        og_description: normalizedSeo?.og_description,
        og_image: normalizedSeo?.og_image,
        status: productData.status ?? ProductStatus.DRAFT,
        published_at: productData.published_at ?? ((productData.status ?? ProductStatus.DRAFT) === ProductStatus.ACTIVE ? new Date() : undefined),
      });
      const savedProduct = await manager.save(Product, product);
      await this.upsertBrandRecord(manager, savedProduct.store_id, savedProduct.brand);

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

      await this.syncProductMetafields(manager, savedProduct.product_id, normalizedMetafields);
      await this.syncProductCountryAvailability(manager, savedProduct.store_id, savedProduct.product_id, normalizedCountryCodes);

      const hydratedProduct = await manager.findOneOrFail(Product, {
        where: { product_id: savedProduct.product_id },
        relations: {
          options: { values: true },
          category_links: { category: true },
          variants: {
            inventory_item: {
              levels: true,
            },
          },
        },
      });

      const metafieldsForProduct = await manager.find(ProductMetafield, {
        where: {
          owner_type: 'product',
          owner_id: hydratedProduct.product_id,
        },
        order: {
          key: 'ASC',
        },
      });

      const countryCodesForProduct = await manager.find(ProductCountryAvailability, {
        where: {
          product_id: hydratedProduct.product_id,
          is_available: true,
        },
        order: {
          country_code: 'ASC',
        },
      });

      const result = {
        ...this.withProjectedFields(hydratedProduct),
        categories: (hydratedProduct.category_links ?? []).map((link) => link.category),
        options: (hydratedProduct.options ?? []).map((option) => ({
          ...option,
          values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
        })),
        metafields: metafieldsForProduct,
        country_codes: countryCodesForProduct.map((row) => row.country_code),
      };

      this.invalidatePublicCaches();
      void this.syncPublicProductToSearchIndex(result.handle ?? String(result.product_id)).catch((error) => {
        console.error('Failed to sync created product ' + (result.handle ?? result.product_id) + ' to Elasticsearch:', error);
      });
      return result;
    });

    return result;
  }

  private splitImportList(value?: string): string[] {
    const source = String(value ?? '').trim();
    if (!source) {
      return [];
    }

    const delimiter = source.includes('|') ? '|' : ',';
    return source
      .split(delimiter)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private normalizeBrandName(value?: string): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private async ensureBrandTable(manager: EntityManager): Promise<void> {
    await manager.query(`
      CREATE TABLE IF NOT EXISTS "Brand" (
        "brand_id" SERIAL PRIMARY KEY,
        "store_id" INT NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "slug" VARCHAR(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await manager.query('CREATE INDEX IF NOT EXISTS "IDX_Brand_store_id" ON "Brand" ("store_id")');
    await manager.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_Brand_store_name_lower" ON "Brand" ("store_id", LOWER("name"))');
  }

  private async upsertBrandRecord(manager: EntityManager, storeId: number, brand?: string): Promise<void> {
    const normalizedBrand = this.normalizeBrandName(brand);
    if (!normalizedBrand) {
      return;
    }

    await this.ensureBrandTable(manager);

    await manager.query(
      `
        INSERT INTO "Brand" ("store_id", "name", "slug")
        SELECT $1::int, $2::text, $3::text
        WHERE NOT EXISTS (
          SELECT 1
          FROM "Brand"
          WHERE "store_id" = $1::int
            AND LOWER("name") = LOWER($2::text)
        )
      `,
      [storeId, normalizedBrand, this.normalizeCategorySlug(normalizedBrand)],
    );
  }

  private normalizeImportStatus(value: string): ProductStatus {
    const normalized = value.trim().toUpperCase();
    switch (normalized) {
      case ProductStatus.DRAFT:
      case ProductStatus.ACTIVE:
      case ProductStatus.ARCHIVED:
        return normalized as ProductStatus;
      default:
        throw new BadRequestException(`Invalid status '${value}'. Expected DRAFT, ACTIVE, or ARCHIVED.`);
    }
  }

  private assertImportRequired(value: string | undefined, field: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new BadRequestException(`Missing required column '${field}'.`);
    }

    return normalized;
  }

  private normalizeImportMediaUrls(value?: string): string[] {
    const parsed = this.splitImportList(value)
      .map((entry) => entry.trim())
      .filter((entry) => /^https?:\/\//i.test(entry));

    return [...new Set(parsed)];
  }

  private inferImportRowType(row: BulkImportProductsInput['rows'][number]): 'product' | 'variant' {
    const hasProductSignals = [row.title, row.category_slugs, row.option1_name, row.option1_values].some((value) => String(value ?? '').trim().length > 0);

    const hasVariantSignals = [
      row.parent_handle,
      row.variant_option1_value,
      row.variant_option2_value,
      row.variant_option3_value,
      row.variant_sku,
      row.variant_barcode,
      row.variant_price,
      row.variant_compare_at_price,
      row.variant_cost_price,
      row.variant_weight,
      row.variant_weight_unit,
      row.variant_inventory_policy,
      row.variant_inventory,
      row.variant_media_urls,
      row.variant_media_url,
    ].some((value) => String(value ?? '').trim().length > 0);

    const hasExplicitParentHandle = String(row.parent_handle ?? '').trim().length > 0;

    if (hasVariantSignals && (hasExplicitParentHandle || !hasProductSignals)) {
      return 'variant';
    }

    return 'product';
  }

  private parseImportOptionalNumber(value: string | undefined, field: string): number | undefined {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`Column '${field}' must be a valid non-negative number.`);
    }

    return parsed;
  }

  private parseImportOptionalInteger(value: string | undefined, field: string): number | undefined {
    const parsed = this.parseImportOptionalNumber(value, field);
    if (parsed === undefined) {
      return undefined;
    }

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`Column '${field}' must be a whole non-negative integer.`);
    }

    return parsed;
  }

  private normalizeImportInventoryPolicy(value?: string): InventoryPolicy | undefined {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    if (!normalized) {
      return undefined;
    }

    if (normalized === InventoryPolicy.DENY || normalized === InventoryPolicy.CONTINUE) {
      return normalized as InventoryPolicy;
    }

    throw new BadRequestException(`Column 'variant_inventory_policy' must be DENY or CONTINUE.`);
  }

  private async ensureVariantMediaUrlsColumn(manager: EntityManager): Promise<void> {
    await manager.query('ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "media_urls" TEXT[]');
  }

  private async resolvePrimaryInventoryLocationId(storeId: number): Promise<number | undefined> {
    const rows = (await this.dataSource.query(
      `
        SELECT "location_id"
        FROM "InventoryLocation"
        WHERE "store_id" = $1
        ORDER BY "is_active" DESC, "location_id" ASC
        LIMIT 1
      `,
      [storeId],
    )) as Array<{ location_id?: number | string }>;

    if (rows.length === 0) {
      return undefined;
    }

    const locationId = Number(rows[0].location_id);
    return Number.isInteger(locationId) && locationId > 0 ? locationId : undefined;
  }

  private async upsertVariantInventoryLevel(inventoryItemId: number | undefined, locationId: number | undefined, quantity: number | undefined): Promise<void> {
    if (quantity == null) {
      return;
    }

    if (!locationId) {
      throw new BadRequestException('No inventory location configured for this store. Set up a location before importing variant_inventory.');
    }

    if (!inventoryItemId) {
      throw new BadRequestException('Variant has no inventory item. Regenerate variant inventory and retry import.');
    }

    await this.dataSource.query(
      `
        INSERT INTO "InventoryLevel" ("inventory_item_id", "location_id", "available_quantity", "reserved_quantity")
        VALUES ($1, $2, $3, 0)
        ON CONFLICT ("inventory_item_id", "location_id")
        DO UPDATE SET
          "available_quantity" = EXCLUDED."available_quantity",
          "updated_at" = NOW()
      `,
      [inventoryItemId, locationId, quantity],
    );
  }

  private buildVariantImportMetafields(
    row: BulkImportProductsInput['rows'][number],
    parentHandle: string,
    option1Value: string,
    option2Value: string | undefined,
    option3Value: string | undefined,
    variantMediaUrls: string[],
    variantInventory: number | undefined,
  ): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = [];

    const add = (key: string, value?: string | number): void => {
      const normalizedValue = String(value ?? '').trim();
      if (!normalizedValue) {
        return;
      }

      entries.push({ key, value: normalizedValue });
    };

    add('import.parent_handle', parentHandle);
    add('import.variant.option1_value', option1Value);
    add('import.variant.option2_value', option2Value);
    add('import.variant.option3_value', option3Value);
    add('import.variant.sku', row.variant_sku);
    add('import.variant.barcode', row.variant_barcode);
    add('import.variant.price', row.variant_price);
    add('import.variant.compare_at_price', row.variant_compare_at_price);
    add('import.variant.cost_price', row.variant_cost_price);
    add('import.variant.weight', row.variant_weight);
    add('import.variant.weight_unit', row.variant_weight_unit);
    add('import.variant.inventory_policy', row.variant_inventory_policy);
    add('import.variant.inventory', variantInventory);
    add('import.variant.media_urls', variantMediaUrls.join('|'));
    if (row.row_number != null) {
      add('import.variant.row_number', row.row_number);
    }

    return entries;
  }

  private async upsertOwnerMetafields(ownerType: string, ownerId: number, entries: Array<{ key: string; value: string }>): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const existing = await this.metafieldRepo.find({
      where: {
        owner_type: ownerType,
        owner_id: ownerId,
      },
    });

    const merged = [...existing];

    for (const entry of entries) {
      const dedupeKey = entry.key.trim().toLowerCase();
      const existingIndex = merged.findIndex((item) => item.key.trim().toLowerCase() === dedupeKey);
      if (existingIndex >= 0) {
        merged[existingIndex] = {
          ...merged[existingIndex],
          key: entry.key,
          value: entry.value,
        };
      } else {
        merged.push(
          this.metafieldRepo.create({
            owner_type: ownerType,
            owner_id: ownerId,
            key: entry.key,
            value: entry.value,
          }),
        );
      }
    }

    await this.metafieldRepo.save(merged);
  }

  async bulkImportProducts(input: BulkImportProductsInput, actor?: User): Promise<BulkImportProductsResponse> {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    const rows = input.rows ?? [];
    if (rows.length === 0) {
      throw new BadRequestException('No rows provided for import.');
    }

    const accessibleStoreIds = await this.getAccessibleStoreIds(actor);
    const shouldContinueOnError = input.continue_on_error ?? true;
    const results: BulkImportProductRowResult[] = [];
    const importRunId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const store = await this.storeRepo.findOne({ where: { store_id: input.store_id } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${input.store_id} not found.`);
    }

    if (accessibleStoreIds && !accessibleStoreIds.includes(store.store_id)) {
      throw new ForbiddenException(`You do not have access to store '${store.store_id}'.`);
    }

    const primaryInventoryLocationId = await this.resolvePrimaryInventoryLocationId(store.store_id);

    this.logger.log(
      `[bulk-import:${importRunId}] started rows=${rows.length} continueOnError=${shouldContinueOnError} actorId=${String(actor.id)} storeId=${store.store_id}`,
    );

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = row.row_number ?? index + 1;
      let createdProductId: number | undefined;
      let createdHandle: string | undefined;

      this.logger.log(
        `[bulk-import:${importRunId}] row=${rowNumber} processing handle=${String(row.handle ?? '').trim()} title=${String(row.title ?? '').trim()}`,
      );

      try {
        const rowType = this.inferImportRowType(row);

        if (rowType === 'variant') {
          await this.ensureVariantMediaUrlsColumn(this.dataSource.manager);

          const parentHandle = this.normalizeCategorySlug(this.assertImportRequired(row.parent_handle ?? row.handle, 'parent_handle'));
          const parentProduct = await this.productRepo.findOne({
            where: { handle: parentHandle },
            relations: {
              options: true,
            },
          });

          if (!parentProduct) {
            throw new NotFoundException(`Parent product '${parentHandle}' not found for variant row.`);
          }

          if (parentProduct.store_id !== store.store_id) {
            throw new ConflictException(`Parent product '${parentHandle}' belongs to another store.`);
          }

          const parentOptions = [...(parentProduct.options ?? [])].sort((a, b) => a.position - b.position);
          if (parentOptions.length === 0) {
            throw new BadRequestException(`Parent product '${parentHandle}' has no options. Import a product row first.`);
          }

          const option1Value = this.assertImportRequired(row.variant_option1_value, 'variant_option1_value');
          const option2Value = String(row.variant_option2_value ?? '').trim() || undefined;
          const option3Value = String(row.variant_option3_value ?? '').trim() || undefined;

          if (parentOptions.length >= 2 && !option2Value) {
            throw new BadRequestException(`Column 'variant_option2_value' is required for parent '${parentHandle}'.`);
          }

          if (parentOptions.length >= 3 && !option3Value) {
            throw new BadRequestException(`Column 'variant_option3_value' is required for parent '${parentHandle}'.`);
          }

          if (parentOptions.length === 1 && (option2Value || option3Value)) {
            throw new BadRequestException(`Parent '${parentHandle}' has one option. variant_option2_value/variant_option3_value must be empty.`);
          }

          if (parentOptions.length === 2 && option3Value) {
            throw new BadRequestException(`Parent '${parentHandle}' has two options. variant_option3_value must be empty.`);
          }

          const variantPrice = this.parseImportOptionalNumber(row.variant_price, 'variant_price');
          const variantCompareAtPrice = this.parseImportOptionalNumber(row.variant_compare_at_price, 'variant_compare_at_price');
          const variantCostPrice = this.parseImportOptionalNumber(row.variant_cost_price, 'variant_cost_price');
          const variantWeight = this.parseImportOptionalNumber(row.variant_weight, 'variant_weight');
          const variantWeightUnit = String(row.variant_weight_unit ?? '').trim() || undefined;
          const variantInventoryPolicy = this.normalizeImportInventoryPolicy(row.variant_inventory_policy);
          const variantInventory = this.parseImportOptionalInteger(row.variant_inventory, 'variant_inventory');
          const variantMediaColumnProvided = row.variant_media_urls !== undefined || row.variant_media_url !== undefined;
          const variantMediaUrls = this.normalizeImportMediaUrls(String(row.variant_media_urls ?? row.variant_media_url ?? '').trim());
          const variantMetafields = this.buildVariantImportMetafields(
            row,
            parentHandle,
            option1Value,
            option2Value,
            option3Value,
            variantMediaUrls,
            variantInventory,
          );

          const existingVariant = await this.variantRepo.findOne({
            where: {
              product_id: parentProduct.product_id,
              option1_value: option1Value,
              option2_value: option2Value ?? IsNull(),
              option3_value: option3Value ?? IsNull(),
            },
          });

          if (existingVariant) {
            const updatedVariant = await this.variantService.update({
              variant_id: existingVariant.variant_id,
              sku: String(row.variant_sku ?? '').trim() || undefined,
              barcode: String(row.variant_barcode ?? '').trim() || undefined,
              price: variantPrice,
              compare_at_price: variantCompareAtPrice,
              cost_price: variantCostPrice,
              weight: variantWeight,
              weight_unit: variantWeightUnit,
              inventory_policy: variantInventoryPolicy,
              ...(variantMediaColumnProvided ? { media_urls: variantMediaUrls } : {}),
            });

            await this.upsertVariantInventoryLevel(updatedVariant.inventory_item_id, primaryInventoryLocationId, variantInventory);

            await this.upsertOwnerMetafields('variant', updatedVariant.variant_id, variantMetafields);

            this.logger.log(`[bulk-import:${importRunId}] row=${rowNumber} updated variantId=${existingVariant.variant_id} parentHandle=${parentHandle}`);

            results.push({
              row_number: rowNumber,
              success: true,
              message: 'Updated existing variant row.',
              product_id: parentProduct.product_id,
              handle: parentHandle,
            });
            continue;
          }

          const createdVariant = await this.variantService.create({
            product_id: parentProduct.product_id,
            option1_value: option1Value,
            option2_value: option2Value,
            option3_value: option3Value,
            sku: String(row.variant_sku ?? '').trim() || undefined,
            barcode: String(row.variant_barcode ?? '').trim() || undefined,
            price: variantPrice,
            compare_at_price: variantCompareAtPrice,
            cost_price: variantCostPrice,
            weight: variantWeight,
            weight_unit: variantWeightUnit,
            inventory_policy: variantInventoryPolicy,
            ...(variantMediaColumnProvided ? { media_urls: variantMediaUrls } : {}),
            create_inventory: true,
          });

          await this.upsertVariantInventoryLevel(createdVariant.inventory_item_id, primaryInventoryLocationId, variantInventory);

          await this.upsertOwnerMetafields('variant', createdVariant.variant_id, variantMetafields);

          this.logger.log(`[bulk-import:${importRunId}] row=${rowNumber} created variantId=${createdVariant.variant_id} parentHandle=${parentHandle}`);

          results.push({
            row_number: rowNumber,
            success: true,
            message: 'Imported variant row.',
            product_id: parentProduct.product_id,
            handle: parentHandle,
          });
          continue;
        }

        const title = this.assertImportRequired(row.title, 'title');
        const handle = this.normalizeCategorySlug(this.assertImportRequired(row.handle, 'handle'));
        const categorySlugs = this.splitImportList(this.assertImportRequired(row.category_slugs, 'category_slugs')).map((slug) =>
          this.normalizeCategorySlug(slug),
        );
        const option1Name = this.assertImportRequired(row.option1_name, 'option1_name');
        const option1Values = this.splitImportList(this.assertImportRequired(row.option1_values, 'option1_values'));

        if (categorySlugs.length === 0) {
          throw new BadRequestException("Column 'category_slugs' must include at least one category slug.");
        }

        if (option1Values.length === 0) {
          throw new BadRequestException("Column 'option1_values' must include at least one value.");
        }

        const optionGroups: Array<{ name: string; values: string[] }> = [{ name: option1Name, values: option1Values }];

        const option2Name = String(row.option2_name ?? '').trim();
        const option2ValuesRaw = String(row.option2_values ?? '').trim();
        if ((option2Name && !option2ValuesRaw) || (!option2Name && option2ValuesRaw)) {
          throw new BadRequestException("Columns 'option2_name' and 'option2_values' must be provided together.");
        }
        if (option2Name && option2ValuesRaw) {
          const option2Values = this.splitImportList(option2ValuesRaw);
          if (option2Values.length === 0) {
            throw new BadRequestException("Column 'option2_values' must include at least one value.");
          }
          optionGroups.push({ name: option2Name, values: option2Values });
        }

        const option3Name = String(row.option3_name ?? '').trim();
        const option3ValuesRaw = String(row.option3_values ?? '').trim();
        if ((option3Name && !option3ValuesRaw) || (!option3Name && option3ValuesRaw)) {
          throw new BadRequestException("Columns 'option3_name' and 'option3_values' must be provided together.");
        }
        if (option3Name && option3ValuesRaw) {
          const option3Values = this.splitImportList(option3ValuesRaw);
          if (option3Values.length === 0) {
            throw new BadRequestException("Column 'option3_values' must include at least one value.");
          }
          optionGroups.push({ name: option3Name, values: option3Values });
        }

        if (optionGroups.length > MAX_OPTIONS_PER_PRODUCT) {
          throw new BadRequestException(`Products can have a maximum of ${MAX_OPTIONS_PER_PRODUCT} options.`);
        }

        const uniqueCategorySlugs = [...new Set(categorySlugs)];
        const categories = await this.resolveImportCategoriesForStore(
          uniqueCategorySlugs,
          actor.id,
          this.inferCategoryMetafieldsFromOptions(optionGroups.map((group) => group.name)),
          `[bulk-import:${importRunId}]`,
        );

        const countryCodes = this.normalizeCountryCodes(this.splitImportList(row.country_codes));
        const mediaUrls = this.normalizeImportMediaUrls(String(row.media_urls ?? row.media_url ?? '').trim());
        const importMetafields = this.buildProductMetafieldsFromCategories(categories);
        const existingProduct = await this.productRepo.findOne({
          where: { handle },
          relations: {
            options: true,
          },
        });

        if (existingProduct) {
          if (existingProduct.store_id !== store.store_id) {
            throw new ConflictException(`Handle '${handle}' already exists in another store.`);
          }

          const existingMetafields = await this.metafieldRepo.find({
            where: {
              owner_type: 'product',
              owner_id: existingProduct.product_id,
            },
          });

          const mergedMetafields = [...existingMetafields.map((entry) => ({ key: entry.key, value: entry.value })), ...importMetafields].reduce<
            Array<{ key: string; value?: string }>
          >((acc, current) => {
            const key = current.key.trim();
            if (!key) {
              return acc;
            }

            const dedupeKey = key.toLowerCase();
            const existingIndex = acc.findIndex((entry) => entry.key.trim().toLowerCase() === dedupeKey);
            if (existingIndex >= 0) {
              acc[existingIndex] = { key, value: current.value };
              return acc;
            }

            acc.push({ key, value: current.value });
            return acc;
          }, []);

          const updated = await this.update(
            {
              product_id: existingProduct.product_id,
              title,
              description: String(row.description ?? '').trim() || undefined,
              brand: String(row.brand ?? '').trim() || undefined,
              status: ProductStatus.DRAFT,
              category_ids: categories.map((category) => category.category_id),
              primary_image_url: mediaUrls[0],
              media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
              seo: {
                handle,
              },
              metafields: mergedMetafields,
              country_codes: countryCodes.length > 0 ? countryCodes : undefined,
            },
            actor,
          );

          if ((existingProduct.options ?? []).length === 0) {
            for (let optionIndex = 0; optionIndex < optionGroups.length; optionIndex += 1) {
              const optionGroup = optionGroups[optionIndex];
              await this.addOption(
                {
                  product_id: updated.product_id,
                  name: optionGroup.name,
                  values: optionGroup.values,
                  position: optionIndex,
                },
                actor,
              );
            }

            await this.variantService.generateVariants({
              product_id: updated.product_id,
              default_price: 0,
              sku_prefix: `P${updated.product_id}`,
              create_inventory: true,
            });
          }

          this.logger.log(`[bulk-import:${importRunId}] row=${rowNumber} updated productId=${updated.product_id} handle=${updated.handle}`);

          results.push({
            row_number: rowNumber,
            success: true,
            message: 'Updated existing product.',
            product_id: updated.product_id,
            handle: updated.handle,
          });
          continue;
        }

        const createdProduct = await this.create(
          {
            title,
            description: String(row.description ?? '').trim() || undefined,
            brand: String(row.brand ?? '').trim() || undefined,
            status: ProductStatus.DRAFT,
            store_id: store.store_id,
            category_ids: categories.map((category) => category.category_id),
            primary_image_url: mediaUrls[0],
            media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
            seo: {
              handle,
            },
            metafields: importMetafields.length > 0 ? importMetafields : undefined,
            country_codes: countryCodes.length > 0 ? countryCodes : undefined,
          },
          actor,
        );

        createdProductId = createdProduct.product_id;
        createdHandle = createdProduct.handle;

        for (let optionIndex = 0; optionIndex < optionGroups.length; optionIndex += 1) {
          const optionGroup = optionGroups[optionIndex];
          await this.addOption(
            {
              product_id: createdProduct.product_id,
              name: optionGroup.name,
              values: optionGroup.values,
              position: optionIndex,
            },
            actor,
          );
        }

        await this.variantService.generateVariants({
          product_id: createdProduct.product_id,
          default_price: 0,
          sku_prefix: `P${createdProduct.product_id}`,
          create_inventory: true,
        });

        this.logger.log(`[bulk-import:${importRunId}] row=${rowNumber} created productId=${createdProduct.product_id} handle=${createdProduct.handle}`);

        results.push({
          row_number: rowNumber,
          success: true,
          message: 'Imported successfully.',
          product_id: createdProduct.product_id,
          handle: createdProduct.handle,
        });
      } catch (error) {
        if (createdProductId) {
          await this.delete(createdProductId, actor).catch(() => undefined);
        }

        const message = error instanceof Error ? error.message : 'Failed to import row.';
        this.logger.error(
          `[bulk-import:${importRunId}] row=${rowNumber} failed message=${message} createdProductId=${createdProductId ?? 'none'} handle=${createdHandle ?? 'none'}`,
        );
        results.push({
          row_number: rowNumber,
          success: false,
          message: createdProductId ? `${message} Rolling back created product '${createdHandle ?? createdProductId}'.` : message,
        });

        if (!shouldContinueOnError) {
          break;
        }
      }
    }

    const successCount = results.filter((result) => result.success).length;
    const failureCount = results.length - successCount;

    this.logger.log(`[bulk-import:${importRunId}] completed total=${results.length} success=${successCount} failure=${failureCount}`);

    return {
      total_rows: results.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
    };
  }

  async update(input: UpdateProductInput, actor?: User): Promise<Product> {
    const normalizedInput = this.normalizeUpdateInput(input);
    const { product_id, category_ids, seo, metafields, country_codes, ...productData } = normalizedInput;
    const normalizedSeo = this.normalizeSeoInput(seo);
    const normalizedMetafields = this.normalizeMetafieldsInput(metafields);
    const normalizedCountryCodes = this.normalizeCountryCodes(country_codes);

    const existingProduct = await this.findOne(product_id, actor);

    const result = await this.dataSource.transaction(async (manager) => {
      if (normalizedSeo?.handle) {
        const existingFlatHandle = await manager
          .createQueryBuilder(Product, 'product')
          .where('product.handle = :handle', { handle: normalizedSeo.handle })
          .andWhere('product.product_id != :productId', { productId: product_id })
          .getOne();

        if (existingFlatHandle) {
          throw new ConflictException(`SEO handle '${normalizedSeo.handle}' already exists`);
        }
      }

      await manager.update(
        Product,
        {
          product_id,
        },
        {
          ...productData,
          ...(normalizedSeo
            ? {
                handle: normalizedSeo.handle,
                meta_title: normalizedSeo.meta_title,
                meta_description: normalizedSeo.meta_description,
                og_title: normalizedSeo.og_title,
                og_description: normalizedSeo.og_description,
                og_image: normalizedSeo.og_image,
              }
            : {}),
        },
      );

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

      await this.syncProductMetafields(manager, product_id, normalizedMetafields);
      await this.syncProductCountryAvailability(manager, existingProduct.store_id, product_id, normalizedCountryCodes);

      const product = await manager.findOneOrFail(Product, {
        where: { product_id },
        relations: {
          options: { values: true },
          category_links: { category: true },
          variants: {
            inventory_item: {
              levels: true,
            },
          },
        },
      });
      await this.upsertBrandRecord(manager, product.store_id, product.brand);

      const metafieldsForProduct = await manager.find(ProductMetafield, {
        where: {
          owner_type: 'product',
          owner_id: product.product_id,
        },
        order: {
          key: 'ASC',
        },
      });

      const countryCodesForProduct = await manager.find(ProductCountryAvailability, {
        where: {
          product_id: product.product_id,
          is_available: true,
        },
        order: {
          country_code: 'ASC',
        },
      });

      const result = {
        ...this.withProjectedFields(product),
        categories: (product.category_links ?? []).map((link) => link.category),
        options: (product.options ?? []).map((option) => ({
          ...option,
          values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
        })),
        metafields: metafieldsForProduct,
        country_codes: countryCodesForProduct.map((row) => row.country_code),
      };

      this.invalidatePublicCaches();

      if (existingProduct.handle && existingProduct.handle !== result.handle) {
        void this.deletePublicProductFromSearchIndexByHandle(existingProduct.handle).catch((error) => {
          console.error('Failed to delete stale product handle ' + existingProduct.handle + ' from Elasticsearch:', error);
        });
      }

      void this.syncPublicProductToSearchIndex(result.handle ?? String(result.product_id)).catch((error) => {
        console.error('Failed to sync updated product ' + (result.handle ?? result.product_id) + ' to Elasticsearch:', error);
      });
      return result;
    });

    return result;
  }

  async delete(productId: number, actor?: User): Promise<boolean> {
    const product = await this.findOne(productId, actor);
    await this.productRepo.delete({ product_id: productId });
    this.invalidatePublicCaches();

    if (product.handle) {
      void this.deletePublicProductFromSearchIndexByHandle(product.handle).catch((error) => {
        console.error('Failed to delete product ' + product.handle + ' from Elasticsearch:', error);
      });
    } else {
      void this.deletePublicProductFromSearchIndexByProductId(productId).catch((error) => {
        console.error('Failed to delete product ' + productId + ' from Elasticsearch:', error);
      });
    }

    return true;
  }

  async addOption(input: AddProductOptionInput, actor?: User): Promise<ProductOption> {
    const { product_id, name, values, position } = input;
    const product = await this.findOne(product_id, actor);

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

    const result = await this.dataSource.transaction(async (manager) => {
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

    this.invalidatePublicCaches();
    void this.syncPublicProductToSearchIndex(product.handle ?? String(product.product_id)).catch((error) => {
      console.error('Failed to sync product ' + (product.handle ?? product.product_id) + ' after adding option to Elasticsearch:', error);
    });

    return result;
  }

  async removeOption(optionId: number, actor?: User): Promise<boolean> {
    const option = await this.optionRepo.findOne({ where: { option_id: optionId } });
    if (!option) {
      throw new NotFoundException(`Option with ID ${optionId} not found`);
    }

    const product = await this.findOne(option.product_id, actor);

    await this.optionRepo.delete({ option_id: optionId });

    this.invalidatePublicCaches();
    void this.syncPublicProductToSearchIndex(product.handle ?? String(product.product_id)).catch((error) => {
      console.error('Failed to sync product ' + (product.handle ?? product.product_id) + ' after removing option from Elasticsearch:', error);
    });

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

    this.invalidatePublicCaches();

    const result = await this.findOne(productId, actor);
    void this.syncPublicProductToSearchIndex(result.handle ?? String(result.product_id)).catch((error) => {
      console.error('Failed to sync published product ' + (result.handle ?? result.product_id) + ' to Elasticsearch:', error);
    });

    return result;
  }

  async archiveProduct(productId: number, actor?: User): Promise<Product> {
    await this.findOne(productId, actor);

    await this.productRepo.update(
      { product_id: productId },
      {
        status: ProductStatus.ARCHIVED,
      },
    );

    this.invalidatePublicCaches();

    const result = await this.findOne(productId, actor);
    void this.syncPublicProductToSearchIndex(result.handle ?? String(result.product_id)).catch((error) => {
      console.error('Failed to sync archived product ' + (result.handle ?? result.product_id) + ' to Elasticsearch:', error);
    });

    return result;
  }

  private normalizeSeoInput(seo: CreateProductInput['seo'] | UpdateProductInput['seo']): CreateProductInput['seo'] | UpdateProductInput['seo'] {
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
      primary_image_url: input.primary_image_url ?? input.primaryImageUrl,
      media_urls: input.media_urls ?? input.mediaUrls,
      country_codes: input.country_codes ?? input.countryCodes,
      published_at: input.published_at ?? input.publishedAt,
      seo: this.normalizeSeoInput(input.seo),
    };
  }

  private normalizeUpdateInput(input: UpdateProductInput): UpdateProductInput {
    return {
      ...input,
      product_id: input.product_id ?? input.productId,
      category_ids: input.category_ids ?? input.categoryIds,
      primary_image_url: input.primary_image_url ?? input.primaryImageUrl,
      media_urls: input.media_urls ?? input.mediaUrls,
      country_codes: input.country_codes ?? input.countryCodes,
      published_at: input.published_at ?? input.publishedAt,
      seo: this.normalizeSeoInput(input.seo),
    };
  }
}
