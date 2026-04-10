/**
 * Collection Service
 * Handles collection CRUD, rule evaluation, and product membership
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from '@elastic/elasticsearch';
import { Repository, In, DataSource } from 'typeorm';
import { Collection, CollectionProduct, CollectionRule, CollectionType, RuleOperator, RuleValueType } from './entities';
import { Product, ProductCountryAvailability } from '../catalog/entities';
import { Variant } from '../variant/entities';
import { ProductStatus, InventoryPolicy } from '../../common/enums/ecommerce.enums';
import { CreateCollectionInput, UpdateCollectionInput, CollectionRuleInput, CollectionFilterInput } from './dto';

type IndexedCollectionProductDocument = {
  product_id: number;
  store_id: number;
  store_name: string;
  title: string;
  brand?: string;
  description?: string;
  handle: string;
  image_url?: string;
  media_urls?: string[];
  options?: Array<{ name: string; values: string[] }>;
  variants?: Array<{
    variant_id: number;
    title?: string;
    sku?: string;
    option1_value?: string;
    option2_value?: string;
    option3_value?: string;
    price?: string;
    compare_at_price?: string;
    inventory_available?: number;
  }>;
  country_codes?: string[];
  status?: ProductStatus;
  updated_at?: string;
};

type IndexedCollectionDocument = {
  collection_id: number;
  store_id: number;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  collection_type: string;
  is_visible: boolean;
  meta_title?: string;
  meta_description?: string;
  product_count: number;
  product_ids: number[];
  created_at?: string;
  updated_at?: string;
};

@Injectable()
export class CollectionService {
  private static readonly COLLECTIONS_CACHE_TTL_MS = 120_000;
  private static readonly COLLECTION_BY_SLUG_CACHE_TTL_MS = 120_000;
  private static readonly COLLECTION_PRODUCTS_CACHE_TTL_MS = 120_000;
  private static readonly DEFAULT_PRODUCT_DETAIL_INDEX = 'products_detail_v1';
  private static readonly DEFAULT_COLLECTION_INDEX = 'collections_v1';
  private readonly collectionsCache = new Map<string, { expiresAt: number; value: Collection[] }>();
  private readonly collectionsInflight = new Map<string, Promise<Collection[]>>();
  private readonly collectionBySlugCache = new Map<string, { expiresAt: number; value: Collection }>();
  private readonly collectionBySlugInflight = new Map<string, Promise<Collection>>();
  private readonly collectionProductsCache = new Map<string, { expiresAt: number; value: { products: Product[]; total: number } }>();
  private readonly collectionProductsInflight = new Map<string, Promise<{ products: Product[]; total: number }>>();
  private readonly esClient?: Client;
  private readonly esProductDetailIndex: string;
  private readonly esCollectionIndex: string;
  private readonly esEnabled: boolean;

  constructor(
    @InjectRepository(Collection)
    private collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionProduct)
    private collectionProductRepo: Repository<CollectionProduct>,
    @InjectRepository(CollectionRule)
    private collectionRuleRepo: Repository<CollectionRule>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Variant)
    private variantRepo: Repository<Variant>,
    @InjectRepository(ProductCountryAvailability)
    private productCountryAvailabilityRepo: Repository<ProductCountryAvailability>,
    private dataSource: DataSource,
  ) {
    const node = (process.env.ELASTICSEARCH_NODE ?? '').trim();
    const username = (process.env.ELASTICSEARCH_USERNAME ?? '').trim();
    const password = process.env.ELASTICSEARCH_PASSWORD ?? '';

    this.esProductDetailIndex =
      (process.env.ELASTICSEARCH_PRODUCT_DETAIL_INDEX ?? CollectionService.DEFAULT_PRODUCT_DETAIL_INDEX).trim() ||
      CollectionService.DEFAULT_PRODUCT_DETAIL_INDEX;
    this.esCollectionIndex =
      (process.env.ELASTICSEARCH_COLLECTION_INDEX ?? CollectionService.DEFAULT_COLLECTION_INDEX).trim() || CollectionService.DEFAULT_COLLECTION_INDEX;
    this.esEnabled = node.length > 0;

    if (this.esEnabled) {
      this.esClient = new Client({
        node,
        ...(username ? { auth: { username, password } } : {}),
      });
      this.initializeCollectionIndex();
    }
  }

  private esIndexReady = false;
  private esCollectionIndexReady = false;

  private initializeCollectionIndex(): void {
    if (!this.esClient) return;
    this.esClient.indices
      .exists({ index: this.esCollectionIndex })
      .then((exists) => {
        if (!exists) {
          return this.esClient!.indices.create({
            index: this.esCollectionIndex,
            mappings: {
              dynamic: false,
              properties: {
                collection_id: { type: 'integer' },
                store_id: { type: 'integer' },
                name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                slug: { type: 'keyword' },
                description: { type: 'text' },
                image_url: { type: 'keyword' },
                collection_type: { type: 'keyword' },
                is_visible: { type: 'boolean' },
                meta_title: { type: 'text' },
                meta_description: { type: 'text' },
                product_count: { type: 'integer' },
                product_ids: { type: 'integer' },
                created_at: { type: 'date' },
                updated_at: { type: 'date' },
              },
            },
          });
        }
      })
      .then(() => {
        this.esCollectionIndexReady = true;
        this.esIndexReady = true;
      })
      .catch((error) => {
        console.error('Failed to initialize collections Elasticsearch index:', error);
        this.esIndexReady = true;
      });
  }

  async syncCollectionToSearchIndex(collectionId: number): Promise<void> {
    if (!this.esEnabled || !this.esClient) return;

    const collection = await this.collectionRepo.findOne({
      where: { collection_id: collectionId },
      relations: ['rules'],
    });

    if (!collection) {
      await this.deleteCollectionFromSearchIndex(collectionId);
      return;
    }

    const productLinks = await this.collectionProductRepo.find({
      where: { collection_id: collectionId },
      select: { product_id: true },
    });

    const document: IndexedCollectionDocument = {
      collection_id: collection.collection_id,
      store_id: collection.store_id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description ?? undefined,
      image_url: collection.image_url ?? undefined,
      collection_type: collection.collection_type,
      is_visible: collection.is_visible,
      meta_title: collection.meta_title ?? undefined,
      meta_description: collection.meta_description ?? undefined,
      product_count: productLinks.length,
      product_ids: productLinks.map((link) => link.product_id),
      created_at: collection.created_at ? new Date(collection.created_at).toISOString() : undefined,
      updated_at: collection.updated_at ? new Date(collection.updated_at).toISOString() : new Date().toISOString(),
    };

    try {
      await this.esClient.index({
        index: this.esCollectionIndex,
        id: String(collectionId),
        document,
        refresh: 'wait_for',
      });
    } catch (error) {
      console.error('Failed to sync collection ' + collectionId + ' to Elasticsearch:', error);
    }
  }

  private async deleteCollectionFromSearchIndex(collectionId: number): Promise<void> {
    if (!this.esEnabled || !this.esClient) return;

    try {
      await this.esClient.delete({
        index: this.esCollectionIndex,
        id: String(collectionId),
        refresh: true,
      });
    } catch (error) {
      const statusCode = (error as { meta?: { statusCode?: number } })?.meta?.statusCode;
      if (statusCode !== 404) {
        console.error('Failed to delete collection ' + collectionId + ' from Elasticsearch:', error);
      }
    }
  }

  private async loadCollectionBySlugFromSearchIndex(storeId: number, slug: string): Promise<Collection | null> {
    if (!this.esEnabled || !this.esClient || !this.esCollectionIndexReady) {
      return null;
    }

    try {
      const response = await this.esClient.search<IndexedCollectionDocument>({
        index: this.esCollectionIndex,
        size: 1,
        track_total_hits: false,
        query: {
          bool: {
            filter: [{ term: { store_id: storeId } }, { term: { slug } }],
          },
        },
      });

      const hit = response.hits.hits[0];
      if (!hit?._source) return null;

      const doc = hit._source;
      return this.mapIndexedCollectionToEntity(doc);
    } catch (error) {
      console.error('Failed to load collection by slug from ES:', error);
      return null;
    }
  }

  private async loadCollectionsFromSearchIndex(filter: CollectionFilterInput): Promise<Collection[] | null> {
    if (!this.esEnabled || !this.esClient || !this.esCollectionIndexReady) {
      return null;
    }

    try {
      const filterClauses: Record<string, unknown>[] = [];

      if (filter.store_id != null) {
        filterClauses.push({ term: { store_id: filter.store_id } });
      }
      if (filter.is_visible != null) {
        filterClauses.push({ term: { is_visible: filter.is_visible } });
      }
      if (filter.collection_type) {
        filterClauses.push({ term: { collection_type: filter.collection_type } });
      }

      const response = await this.esClient.search<IndexedCollectionDocument>({
        index: this.esCollectionIndex,
        size: 100,
        track_total_hits: false,
        sort: [{ updated_at: { order: 'desc' } }],
        query: filterClauses.length > 0 ? { bool: { filter: filterClauses } } : { match_all: {} },
      });

      return response.hits.hits
        .map((hit) => hit._source)
        .filter((source): source is IndexedCollectionDocument => Boolean(source))
        .map((doc) => this.mapIndexedCollectionToEntity(doc));
    } catch (error) {
      console.error('Failed to load collections from ES:', error);
      return null;
    }
  }

  private mapIndexedCollectionToEntity(doc: IndexedCollectionDocument): Collection {
    const fallbackTimestamp = doc.updated_at ?? doc.created_at;
    const normalizedCreatedAt = doc.created_at ? new Date(doc.created_at) : fallbackTimestamp ? new Date(fallbackTimestamp) : new Date();
    const normalizedUpdatedAt = doc.updated_at ? new Date(doc.updated_at) : normalizedCreatedAt;

    const collection = new Collection();
    collection.collection_id = doc.collection_id;
    collection.store_id = doc.store_id;
    collection.name = doc.name;
    collection.slug = doc.slug;
    collection.description = doc.description ?? null;
    collection.image_url = doc.image_url ?? null;
    collection.collection_type = doc.collection_type as CollectionType;
    collection.is_visible = doc.is_visible;
    collection.meta_title = doc.meta_title ?? null;
    collection.meta_description = doc.meta_description ?? null;
    collection.product_count = doc.product_count;
    collection.created_at = normalizedCreatedAt;
    collection.updated_at = normalizedUpdatedAt;
    collection.rules = [];
    return collection;
  }

  private normalizeCountryCode(value?: string): string | undefined {
    const normalized = (value ?? '').trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }

    if (!/^[A-Z]{2}$/.test(normalized)) {
      throw new BadRequestException(`Invalid country code '${value}'. Use ISO-2 uppercase codes like US or GB.`);
    }

    return normalized;
  }

  private mapProjectedProducts(products: Product[]): Product[] {
    return products.map((product) => {
      const projected = this.withProjectedProductFields(product);
      projected.categories = projected.category ? [projected.category] : [];
      return projected;
    });
  }

  private async filterProductIdsByCountry(storeId: number, productIds: number[], countryCode?: string): Promise<number[]> {
    const normalizedCountryCode = this.normalizeCountryCode(countryCode);
    if (!normalizedCountryCode || productIds.length === 0) {
      return productIds;
    }

    const rows = await this.productCountryAvailabilityRepo.find({
      where: {
        store_id: storeId,
        product_id: In(productIds),
        is_available: true,
      },
      order: {
        country_code: 'ASC',
      },
    });

    const countrySetByProductId = new Map<number, Set<string>>();
    for (const row of rows) {
      if (row.product_id == null) {
        continue;
      }

      const existing = countrySetByProductId.get(row.product_id) ?? new Set<string>();
      existing.add(row.country_code);
      countrySetByProductId.set(row.product_id, existing);
    }

    return productIds.filter((productId) => {
      const allowedCountries = countrySetByProductId.get(productId);
      if (!allowedCountries || allowedCountries.size === 0) {
        return true;
      }

      return allowedCountries.has(normalizedCountryCode);
    });
  }

  private invalidateCollectionCaches(): void {
    this.collectionsCache.clear();
    this.collectionsInflight.clear();
    this.collectionBySlugCache.clear();
    this.collectionBySlugInflight.clear();
    this.collectionProductsCache.clear();
    this.collectionProductsInflight.clear();
  }

  private buildCollectionProductsCacheKey(collectionId: number, limit: number, offset: number, countryCode?: string): string {
    return `${collectionId}:${limit}:${offset}:${countryCode ?? ''}`;
  }

  private getCachedCollectionProducts(cacheKey: string): { products: Product[]; total: number } | undefined {
    const cacheEntry = this.collectionProductsCache.get(cacheKey);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.collectionProductsCache.delete(cacheKey);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedCollectionProducts(cacheKey: string, value: { products: Product[]; total: number }): void {
    this.collectionProductsCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + CollectionService.COLLECTION_PRODUCTS_CACHE_TTL_MS,
    });
  }

  private getCachedCollections(cacheKey: string): Collection[] | undefined {
    const cacheEntry = this.collectionsCache.get(cacheKey);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.collectionsCache.delete(cacheKey);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedCollections(cacheKey: string, value: Collection[]): void {
    this.collectionsCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + CollectionService.COLLECTIONS_CACHE_TTL_MS,
    });
  }

  private getCachedCollectionBySlug(cacheKey: string): Collection | undefined {
    const cacheEntry = this.collectionBySlugCache.get(cacheKey);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt < Date.now()) {
      this.collectionBySlugCache.delete(cacheKey);
      return undefined;
    }

    return cacheEntry.value;
  }

  private setCachedCollectionBySlug(cacheKey: string, value: Collection): void {
    this.collectionBySlugCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + CollectionService.COLLECTION_BY_SLUG_CACHE_TTL_MS,
    });
  }

  private buildCollectionsCacheKey(filter: CollectionFilterInput = {}): string {
    return JSON.stringify({
      store_id: filter.store_id ?? null,
      collection_type: filter.collection_type ?? null,
      is_visible: filter.is_visible ?? null,
    });
  }

  private buildCollectionBySlugCacheKey(storeId: number, slug: string): string {
    return `${storeId}:${slug.toLowerCase()}`;
  }

  private withProjectedProductFields(product: Product): Product {
    return {
      ...product,
      seo: product.handle
        ? {
            product_seo_id: product.product_id,
            product_id: product.product_id,
            handle: product.handle,
            meta_title: product.meta_title,
            meta_description: product.meta_description,
            og_title: product.og_title,
            og_description: product.og_description,
            og_image: product.og_image,
          }
        : undefined,
      media: (Array.isArray(product.media_urls) ? product.media_urls : []).map((url, index) => ({
        media_id: product.product_id * 100000 + (index + 1),
        product_id: product.product_id,
        url,
        alt_text: undefined,
        type: 'image',
        position: index,
        is_cover: index === 0,
        created_at: product.created_at,
      })),
    };
  }

  private parseNumericValue(value?: string): number | undefined {
    if (value == null || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private mapSearchDocumentToProjectedProduct(source: IndexedCollectionProductDocument): Product {
    const timestamp = source.updated_at ? new Date(source.updated_at) : new Date();

    const options = (source.options ?? []).map((option, optionIndex) => ({
      option_id: source.product_id * 100 + (optionIndex + 1),
      product_id: source.product_id,
      name: option.name,
      position: optionIndex + 1,
      values: (option.values ?? []).map((value, valueIndex) => ({
        value_id: source.product_id * 10_000 + (optionIndex + 1) * 100 + (valueIndex + 1),
        option_id: source.product_id * 100 + (optionIndex + 1),
        value,
        position: valueIndex + 1,
      })),
    }));

    const variants = (source.variants ?? []).map((variant) => ({
      variant_id: variant.variant_id,
      product_id: source.product_id,
      option1_value: variant.option1_value,
      option2_value: variant.option2_value,
      option3_value: variant.option3_value,
      sku: variant.sku,
      barcode: undefined,
      price: this.parseNumericValue(variant.price),
      compare_at_price: this.parseNumericValue(variant.compare_at_price),
      cost_price: undefined,
      weight: undefined,
      weight_unit: undefined,
      inventory_policy: InventoryPolicy.DENY,
      is_default: false,
      created_at: timestamp,
      updated_at: timestamp,
      inventory_item_id: undefined,
      inventory_item: undefined,
      title: variant.title,
    }));

    return this.withProjectedProductFields({
      product_id: source.product_id,
      title: source.title,
      description: source.description,
      brand: source.brand,
      handle: source.handle,
      meta_title: source.title,
      meta_description: source.description,
      og_title: source.title,
      og_description: source.description,
      og_image: source.image_url,
      primary_image_url: source.image_url,
      media_urls: source.media_urls ?? (source.image_url ? [source.image_url] : []),
      order_count: 0,
      order_count_30d: 0,
      view_count: 0,
      view_count_30d: 0,
      add_to_cart_count: 0,
      add_to_cart_count_30d: 0,
      total_revenue: 0,
      revenue_30d: 0,
      best_selling_score: 0,
      trending_score: 0,
      event_counters: undefined,
      related_product_ids: [],
      copurchased_product_ids: [],
      last_computed_at: timestamp,
      status: source.status ?? ProductStatus.ACTIVE,
      published_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
      store_id: source.store_id,
      store: undefined,
      seo: undefined,
      options,
      category: undefined,
      category_id: undefined,
      categories: [],
      variants,
      media: [],
      metafields: [],
      country_availability: [],
      country_codes: source.country_codes ?? [],
    } as unknown as Product);
  }

  private isSearchDocumentAllowedForCountry(documentCountryCodes: string[] | undefined, countryCode?: string): boolean {
    if (!countryCode) {
      return true;
    }

    if (!documentCountryCodes || documentCountryCodes.length === 0) {
      return true;
    }

    return documentCountryCodes.includes(countryCode);
  }

  private async loadProjectedProductsFromSearchIndex(productIds: number[], countryCode?: string): Promise<Map<number, Product> | null> {
    if (!this.esEnabled || !this.esClient || productIds.length === 0) {
      return null;
    }

    try {
      // Use filter context for non-scoring filters (enables ES query caching)
      const filterClauses: Record<string, unknown>[] = [{ terms: { product_id: productIds } }];

      if (countryCode) {
        filterClauses.push({
          bool: {
            should: [{ term: { country_codes: countryCode } }, { bool: { must_not: { exists: { field: 'country_codes' } } } }],
            minimum_should_match: 1,
          },
        });
      }

      const response = await this.esClient.search<IndexedCollectionProductDocument>({
        index: this.esProductDetailIndex,
        size: Math.min(productIds.length, 10_000),
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
          'variants',
          'options',
          'country_codes',
        ],
        query: {
          bool: {
            filter: filterClauses,
          },
        },
      });

      const mapped = new Map<number, Product>();
      for (const hit of response.hits.hits) {
        const source = hit._source;
        if (!source) continue;

        if (!this.isSearchDocumentAllowedForCountry(source.country_codes, countryCode)) continue;

        mapped.set(source.product_id, this.mapSearchDocumentToProjectedProduct(source));
      }

      return mapped;
    } catch (error) {
      console.error('Failed to load collection products from Elasticsearch:', error);
      return null;
    }
  }

  private async loadManualCollectionProductsFromSearchIndex(
    collectionId: number,
    limit: number,
    offset: number,
    countryCode?: string,
    expectedTotal?: number,
  ): Promise<{ products: Product[]; total: number } | null> {
    if (!this.esEnabled || !this.esClient) {
      return null;
    }

    try {
      // Use filter context for non-scoring filters (enables ES query caching)
      const filterClauses: Record<string, unknown>[] = [{ term: { collection_ids: collectionId } }, { term: { status: ProductStatus.ACTIVE } }];

      if (countryCode) {
        filterClauses.push({
          bool: {
            should: [{ term: { country_codes: countryCode } }, { bool: { must_not: { exists: { field: 'country_codes' } } } }],
            minimum_should_match: 1,
          },
        });
      }

      const response = await this.esClient.search<IndexedCollectionProductDocument>({
        index: this.esProductDetailIndex,
        from: offset,
        size: Math.max(limit, 1),
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
          'variants',
          'options',
          'country_codes',
        ],
        sort: [{ updated_at: { order: 'desc' } }, { product_id: { order: 'desc' } }],
        query: {
          bool: {
            filter: filterClauses,
          },
        },
      });
      const totalHits = typeof expectedTotal === 'number' ? expectedTotal : offset + response.hits.hits.length;

      const products = response.hits.hits
        .map((hit) => hit._source)
        .filter((source): source is IndexedCollectionProductDocument => Boolean(source))
        .filter((source) => this.isSearchDocumentAllowedForCountry(source.country_codes, countryCode))
        .map((source) => this.mapSearchDocumentToProjectedProduct(source));

      return {
        products,
        total: totalHits,
      };
    } catch (error) {
      console.error('Failed to load manual collection products from Elasticsearch:', error);
      return null;
    }
  }

  private async syncCollectionMembershipsInSearchIndex(productIds: number[]): Promise<void> {
    if (!this.esEnabled || !this.esClient || productIds.length === 0) {
      return;
    }

    const uniqueProductIds = [...new Set(productIds.filter((productId) => Number.isFinite(productId)))];
    if (uniqueProductIds.length === 0) {
      return;
    }

    const links = await this.collectionProductRepo.find({
      where: { product_id: In(uniqueProductIds) },
      select: {
        product_id: true,
        collection_id: true,
      },
      order: {
        position: 'ASC',
      },
    });

    const collectionIdsByProductId = new Map<number, number[]>();
    for (const link of links) {
      const list = collectionIdsByProductId.get(link.product_id) ?? [];
      list.push(link.collection_id);
      collectionIdsByProductId.set(link.product_id, list);
    }

    await Promise.all(
      uniqueProductIds.map(async (productId) => {
        const collectionIds = collectionIdsByProductId.get(productId) ?? [];
        try {
          await this.esClient!.updateByQuery({
            index: this.esProductDetailIndex,
            refresh: true,
            query: {
              term: {
                product_id: productId,
              },
            },
            script: {
              lang: 'painless',
              source: 'ctx._source.collection_ids = params.collectionIds;',
              params: {
                collectionIds,
              },
            },
          });
        } catch (error) {
          console.error('Failed to sync collection memberships in Elasticsearch for product ' + productId + ':', error);
        }
      }),
    );
  }

  // ============================================
  // COLLECTION CRUD
  // ============================================

  async create(input: CreateCollectionInput): Promise<Collection> {
    const slug = input.slug || this.generateSlug(input.name);

    // Check for duplicate slug
    const existing = await this.collectionRepo.findOne({
      where: { store_id: input.store_id, slug },
    });
    if (existing) {
      throw new BadRequestException(`Collection with slug "${slug}" already exists`);
    }

    const collection = this.collectionRepo.create({
      store_id: input.store_id,
      name: input.name,
      slug,
      description: input.description,
      collection_type: input.collection_type,
      image_url: input.image_url,
      meta_title: input.meta_title,
      meta_description: input.meta_description,
      is_visible: true,
    });

    const saved = await this.collectionRepo.save(collection);

    // Add products for manual collections
    if (input.collection_type === CollectionType.MANUAL && input.product_ids?.length) {
      await this.addProducts(saved.collection_id, input.product_ids);
    }

    // Add rules for automated collections
    if (input.collection_type === CollectionType.AUTOMATED && input.rules?.length) {
      await this.setRules(saved.collection_id, input.rules);
    }

    this.invalidateCollectionCaches();
    await this.syncCollectionToSearchIndex(saved.collection_id);
    return this.findById(saved.collection_id);
  }

  async update(input: UpdateCollectionInput): Promise<Collection> {
    const collection = await this.findById(input.collection_id);

    if (input.slug !== undefined && input.slug !== collection.slug) {
      const existing = await this.collectionRepo.findOne({
        where: { store_id: collection.store_id, slug: input.slug },
      });
      if (existing && existing.collection_id !== collection.collection_id) {
        throw new BadRequestException(`Collection with slug "${input.slug}" already exists`);
      }
    }

    if (input.name !== undefined) collection.name = input.name;
    if (input.slug !== undefined) collection.slug = input.slug;
    if (input.description !== undefined) collection.description = input.description;
    if (input.image_url !== undefined) collection.image_url = input.image_url;
    if (input.is_visible !== undefined) collection.is_visible = input.is_visible;
    if (input.meta_title !== undefined) collection.meta_title = input.meta_title;
    if (input.meta_description !== undefined) collection.meta_description = input.meta_description;

    const saved = await this.collectionRepo.save(collection);

    if (collection.collection_type === CollectionType.AUTOMATED && input.rules) {
      await this.setRules(collection.collection_id, input.rules);
    }

    if (collection.collection_type === CollectionType.MANUAL && input.product_ids) {
      const existingLinks = await this.collectionProductRepo.find({
        where: { collection_id: collection.collection_id },
        select: { product_id: true },
      });
      const impactedProductIds = new Set<number>(existingLinks.map((link) => link.product_id));

      await this.collectionProductRepo.delete({ collection_id: collection.collection_id });
      if (input.product_ids.length > 0) {
        await this.addProducts(collection.collection_id, input.product_ids);
        for (const productId of input.product_ids) {
          impactedProductIds.add(productId);
        }
      }

      if (impactedProductIds.size > 0) {
        await this.syncCollectionMembershipsInSearchIndex([...impactedProductIds]);
      }
    }

    this.invalidateCollectionCaches();
    await this.syncCollectionToSearchIndex(saved.collection_id);
    return this.findById(saved.collection_id);
  }

  async delete(collectionId: number): Promise<boolean> {
    const linkedProducts = await this.collectionProductRepo.find({
      where: { collection_id: collectionId },
      select: { product_id: true },
    });

    const result = await this.collectionRepo.delete(collectionId);
    if ((result.affected ?? 0) > 0) {
      await this.syncCollectionMembershipsInSearchIndex(linkedProducts.map((link) => link.product_id));
      await this.deleteCollectionFromSearchIndex(collectionId);
      this.invalidateCollectionCaches();
    }
    return (result.affected ?? 0) > 0;
  }

  async findById(collectionId: number): Promise<Collection> {
    const collection = await this.collectionRepo.findOne({
      where: { collection_id: collectionId },
      relations: ['rules'],
    });

    if (!collection) {
      throw new NotFoundException(`Collection ${collectionId} not found`);
    }

    return collection;
  }

  async findBySlug(storeId: number, slug: string): Promise<Collection> {
    const cacheKey = this.buildCollectionBySlugCacheKey(storeId, slug);
    const cached = this.getCachedCollectionBySlug(cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.collectionBySlugInflight.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = this.loadCollectionBySlugFromSearchIndex(storeId, slug)
      .then(async (esCollection) => {
        if (esCollection) {
          this.setCachedCollectionBySlug(cacheKey, esCollection);
          return esCollection;
        }

        // Fallback to DB if ES doesn't have the collection
        const collection = await this.collectionRepo.findOne({
          where: { store_id: storeId, slug },
          relations: ['rules'],
        });

        if (!collection) {
          throw new NotFoundException(`Collection "${slug}" not found`);
        }
        this.setCachedCollectionBySlug(cacheKey, collection);
        return collection;
      })
      .finally(() => {
        this.collectionBySlugInflight.delete(cacheKey);
      });

    this.collectionBySlugInflight.set(cacheKey, pending);
    return pending;
  }

  async findAll(filter: CollectionFilterInput = {}): Promise<Collection[]> {
    const cacheKey = this.buildCollectionsCacheKey(filter);
    const cached = this.getCachedCollections(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.collectionsInflight.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = this.loadCollections(filter)
      .then(async (collections) => {
        this.setCachedCollections(cacheKey, collections);
        return collections;
      })
      .finally(() => {
        this.collectionsInflight.delete(cacheKey);
      });

    this.collectionsInflight.set(cacheKey, pending);
    return pending;
  }

  private async loadCollections(filter: CollectionFilterInput = {}): Promise<Collection[]> {
    const query = this.collectionRepo.createQueryBuilder('c');

    if (filter.store_id) {
      query.andWhere('c.store_id = :storeId', { storeId: filter.store_id });
    }
    if (filter.collection_type) {
      query.andWhere('c.collection_type = :type', { type: filter.collection_type });
    }
    if (filter.is_visible !== undefined) {
      query.andWhere('c.is_visible = :visible', { visible: filter.is_visible });
    }

    query.orderBy('c.position', 'ASC');

    return query.getMany();
  }

  private async attachCollectionRules(collection: Collection): Promise<Collection> {
    const rules = await this.collectionRuleRepo.find({
      where: { collection_id: collection.collection_id },
      order: { rule_group: 'ASC', rule_id: 'ASC' },
    });

    collection.rules = rules;
    return collection;
  }
  // ============================================
  // MANUAL COLLECTION PRODUCTS
  // ============================================

  async addProducts(collectionId: number, productIds: number[]): Promise<Collection> {
    const collection = await this.findById(collectionId);

    if (collection.collection_type !== CollectionType.MANUAL) {
      throw new BadRequestException('Cannot manually add products to automated collection');
    }

    // Get current max position
    const maxPosition = await this.collectionProductRepo
      .createQueryBuilder('cp')
      .where('cp.collection_id = :collectionId', { collectionId })
      .select('MAX(cp.position)', 'max')
      .getRawOne();

    let position = (maxPosition?.max || 0) + 1;

    const links = productIds.map((productId) => {
      return this.collectionProductRepo.create({
        collection_id: collectionId,
        product_id: productId,
        position: position++,
      });
    });

    await this.collectionProductRepo.save(links);
    await this.syncCollectionMembershipsInSearchIndex(productIds);
    await this.syncCollectionToSearchIndex(collectionId);

    this.invalidateCollectionCaches();
    return this.findById(collectionId);
  }

  async removeProducts(collectionId: number, productIds: number[]): Promise<Collection> {
    await this.collectionProductRepo.delete({
      collection_id: collectionId,
      product_id: In(productIds),
    });

    await this.syncCollectionMembershipsInSearchIndex(productIds);
    await this.syncCollectionToSearchIndex(collectionId);

    this.invalidateCollectionCaches();
    return this.findById(collectionId);
  }

  async reorderProducts(collectionId: number, productIds: number[]): Promise<Collection> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let i = 0; i < productIds.length; i++) {
        await queryRunner.manager.update(CollectionProduct, { collection_id: collectionId, product_id: productIds[i] }, { position: i });
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    this.invalidateCollectionCaches();
    return this.findById(collectionId);
  }

  // ============================================
  // AUTOMATED COLLECTION RULES
  // ============================================

  async setRules(collectionId: number, rules: CollectionRuleInput[]): Promise<Collection> {
    const collection = await this.findById(collectionId);

    if (collection.collection_type !== CollectionType.AUTOMATED) {
      throw new BadRequestException('Cannot add rules to manual collection');
    }

    // Delete existing rules
    await this.collectionRuleRepo.delete({ collection_id: collectionId });

    // Create new rules
    const ruleEntities = rules.map((rule) =>
      this.collectionRuleRepo.create({
        collection_id: collectionId,
        rule_group: rule.rule_group,
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        value_type: rule.value_type || RuleValueType.STRING,
      }),
    );

    await this.collectionRuleRepo.save(ruleEntities);

    this.invalidateCollectionCaches();
    return this.findById(collectionId);
  }

  // ============================================
  // GET COLLECTION PRODUCTS
  // ============================================

  async getCollectionProducts(
    collectionId: number,
    limit: number = 50,
    offset: number = 0,
    countryCode?: string,
  ): Promise<{ products: Product[]; total: number }> {
    const normalizedCountryCode = this.normalizeCountryCode(countryCode);
    const cacheKey = this.buildCollectionProductsCacheKey(collectionId, limit, offset, normalizedCountryCode);

    const cached = this.getCachedCollectionProducts(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.collectionProductsInflight.get(cacheKey);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = this.findById(collectionId)
      .then((collection) => {
        if (collection.collection_type === CollectionType.MANUAL) {
          return this.getManualCollectionProducts(collection, limit, offset, normalizedCountryCode);
        }

        return this.getAutomatedCollectionProducts(collection, limit, offset, normalizedCountryCode);
      })
      .then((result) => {
        this.setCachedCollectionProducts(cacheKey, result);
        return result;
      })
      .finally(() => {
        this.collectionProductsInflight.delete(cacheKey);
      });

    this.collectionProductsInflight.set(cacheKey, pending);
    return pending;
  }

  private async getManualCollectionProducts(
    collection: Collection,
    limit: number,
    offset: number,
    countryCode?: string,
  ): Promise<{ products: Product[]; total: number }> {
    const manualProductsFromSearch = await this.loadManualCollectionProductsFromSearchIndex(
      collection.collection_id,
      limit,
      offset,
      countryCode,
      collection.product_count,
    );
    if (manualProductsFromSearch) {
      return manualProductsFromSearch;
    }

    const links = await this.collectionProductRepo.find({
      where: { collection_id: collection.collection_id },
      select: {
        product_id: true,
        position: true,
      },
      order: { position: 'ASC' },
    });

    if (links.length === 0) {
      return { products: [], total: 0 };
    }

    const allProductIds = links.map((link) => link.product_id);
    const searchProductsById = await this.loadProjectedProductsFromSearchIndex(allProductIds, countryCode);

    if (searchProductsById && searchProductsById.size > 0) {
      const filteredProductIds = allProductIds.filter((productId) => searchProductsById.has(productId));
      const pagedProductIds = filteredProductIds.slice(offset, offset + limit);

      return {
        products: pagedProductIds.map((productId) => searchProductsById.get(productId)).filter((product): product is Product => Boolean(product)),
        total: filteredProductIds.length,
      };
    }

    const filteredProductIds = countryCode ? await this.filterProductIdsByCountry(collection.store_id, allProductIds, countryCode) : allProductIds;

    if (filteredProductIds.length === 0) {
      return { products: [], total: 0 };
    }

    const pagedProductIds = filteredProductIds.slice(offset, offset + limit);
    if (pagedProductIds.length === 0) {
      return { products: [], total: filteredProductIds.length };
    }

    const products = await this.productRepo.find({
      where: { product_id: In(pagedProductIds) },
      relations: ['variants', 'options', 'options.values', 'category'],
    });

    const productById = new Map<number, Product>(products.map((product) => [product.product_id, product]));
    const orderedProducts = pagedProductIds.map((productId) => productById.get(productId)).filter((product): product is Product => Boolean(product));

    return {
      products: this.mapProjectedProducts(orderedProducts),
      total: filteredProductIds.length,
    };
  }

  private async getAutomatedCollectionProducts(
    collection: Collection,
    limit: number,
    offset: number,
    countryCode?: string,
  ): Promise<{ products: Product[]; total: number }> {
    const rules = await this.collectionRuleRepo.find({
      where: { collection_id: collection.collection_id },
    });

    if (!rules.length) {
      return { products: [], total: 0 };
    }

    // Build dynamic query based on rules
    const productIds = await this.evaluateRules(collection.store_id, rules);

    if (!productIds.length) {
      return { products: [], total: 0 };
    }

    const searchProductsById = await this.loadProjectedProductsFromSearchIndex(productIds, countryCode);
    if (searchProductsById && searchProductsById.size > 0) {
      const filteredProductIds = productIds.filter((productId) => searchProductsById.has(productId));
      const pagedProductIds = filteredProductIds.slice(offset, offset + limit);

      return {
        products: pagedProductIds.map((productId) => searchProductsById.get(productId)).filter((product): product is Product => Boolean(product)),
        total: filteredProductIds.length,
      };
    }

    const filteredProductIds = await this.filterProductIdsByCountry(collection.store_id, productIds, countryCode);
    if (!filteredProductIds.length) {
      return { products: [], total: 0 };
    }

    const pagedProductIds = filteredProductIds.slice(offset, offset + limit);
    if (!pagedProductIds.length) {
      return { products: [], total: filteredProductIds.length };
    }

    const products = await this.productRepo.find({
      where: { product_id: In(pagedProductIds) },
      relations: ['variants', 'options', 'options.values', 'category'],
      order: {
        published_at: 'DESC',
        created_at: 'DESC',
      },
    });

    const productById = new Map<number, Product>(products.map((product) => [product.product_id, product]));
    const orderedProducts = pagedProductIds.map((productId) => productById.get(productId)).filter((product): product is Product => Boolean(product));

    return {
      products: this.mapProjectedProducts(orderedProducts),
      total: filteredProductIds.length,
    };
  }

  /**
   * Evaluate collection rules and return matching product IDs
   * Rules in same group are ANDed, different groups are ORed
   */
  private async evaluateRules(storeId: number, rules: CollectionRule[]): Promise<number[]> {
    // Group rules by rule_group
    const groups = new Map<number, CollectionRule[]>();
    for (const rule of rules) {
      if (!groups.has(rule.rule_group)) {
        groups.set(rule.rule_group, []);
      }
      groups.get(rule.rule_group)!.push(rule);
    }

    const groupResults: Set<number>[] = [];

    for (const [, groupRules] of groups) {
      const productIds = await this.evaluateRuleGroup(storeId, groupRules);
      groupResults.push(new Set(productIds));
    }

    // Union all groups (OR)
    const result = new Set<number>();
    for (const group of groupResults) {
      for (const id of group) {
        result.add(id);
      }
    }

    return Array.from(result);
  }

  private async evaluateRuleGroup(storeId: number, rules: CollectionRule[]): Promise<number[]> {
    const query = this.productRepo
      .createQueryBuilder('p')
      .leftJoin('p.variants', 'v')
      .where('p.store_id = :storeId', { storeId })
      .select('DISTINCT p.product_id', 'product_id');

    for (const rule of rules) {
      const clause = this.buildRuleClause(rule);
      query.andWhere(clause.sql, clause.params);
    }

    const results = await query.getRawMany();
    return results.map((r) => r.product_id);
  }

  private buildRuleClause(rule: CollectionRule): { sql: string; params: Record<string, unknown> } {
    const { field, operator, value, value_type } = rule;
    const paramKey = `param_${Math.random().toString(36).substr(2, 9)}`;

    // Field mapping
    let column: string;
    switch (field) {
      case 'price':
        column = 'v.price';
        break;
      case 'title':
        column = 'p.title';
        break;
      case 'brand':
        column = 'p.brand';
        break;
      case 'category':
        column = 'p.category_id';
        break;
      case 'status':
        column = 'p.status';
        break;
      default:
        column = `p.${field}`;
    }

    // Parse value
    let parsedValue: unknown = value;
    if (value_type === RuleValueType.NUMBER) {
      parsedValue = parseFloat(value);
    } else if (value_type === RuleValueType.BOOLEAN) {
      parsedValue = value === 'true';
    } else if (value_type === RuleValueType.ARRAY) {
      parsedValue = JSON.parse(value);
    }

    // Build SQL
    let sql: string;
    switch (operator) {
      case RuleOperator.EQUALS:
        sql = `${column} = :${paramKey}`;
        break;
      case RuleOperator.NOT_EQUALS:
        sql = `${column} != :${paramKey}`;
        break;
      case RuleOperator.GREATER_THAN:
        sql = `${column} > :${paramKey}`;
        break;
      case RuleOperator.LESS_THAN:
        sql = `${column} < :${paramKey}`;
        break;
      case RuleOperator.GREATER_THAN_OR_EQUAL:
        sql = `${column} >= :${paramKey}`;
        break;
      case RuleOperator.LESS_THAN_OR_EQUAL:
        sql = `${column} <= :${paramKey}`;
        break;
      case RuleOperator.CONTAINS:
        sql = `${column} ILIKE :${paramKey}`;
        parsedValue = `%${value}%`;
        break;
      case RuleOperator.NOT_CONTAINS:
        sql = `${column} NOT ILIKE :${paramKey}`;
        parsedValue = `%${value}%`;
        break;
      case RuleOperator.STARTS_WITH:
        sql = `${column} ILIKE :${paramKey}`;
        parsedValue = `${value}%`;
        break;
      case RuleOperator.IS_SET:
        sql = `${column} IS NOT NULL`;
        return { sql, params: {} };
      case RuleOperator.IS_NOT_SET:
        sql = `${column} IS NULL`;
        return { sql, params: {} };
      default:
        sql = `${column} = :${paramKey}`;
    }

    return { sql, params: { [paramKey]: parsedValue } };
  }

  // ============================================
  // UTILITIES
  // ============================================

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async getProductCount(collectionId: number): Promise<number> {
    const collection = await this.findById(collectionId);

    if (collection.collection_type === CollectionType.MANUAL) {
      return this.collectionProductRepo.count({
        where: { collection_id: collectionId },
      });
    } else {
      const rules = await this.collectionRuleRepo.find({
        where: { collection_id: collection.collection_id },
      });
      if (!rules.length) {
        return 0;
      }
      const productIds = await this.evaluateRules(collection.store_id, rules);
      return productIds.length;
    }
  }
}





