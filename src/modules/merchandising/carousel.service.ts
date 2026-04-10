/**
 * Carousel Service
 * Provides data for product carousels: New Arrivals, Best Sellers, Trending, Related
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../catalog/entities';
import { CollectionService } from './collection.service';
import { CarouselProduct } from './dto';
import { ProductStatus } from '../../common/enums/ecommerce.enums';

export interface CarouselOptions {
  limit?: number;
  offset?: number;
  storeId?: number;
}

@Injectable()
export class CarouselService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private collectionService: CollectionService,
  ) {}

  // ============================================
  // NEW ARRIVALS
  // ============================================

  /**
   * Get new arrivals - products recently added to catalog
   * Sorted by created_at DESC
   */
  async getNewArrivals(options: CarouselOptions = {}): Promise<CarouselProduct[]> {
    const { limit = 12, offset = 0, storeId } = options;

    const query = this.productRepo.createQueryBuilder('p').leftJoinAndSelect('p.variants', 'v').where('p.status = :status', { status: ProductStatus.ACTIVE });

    if (storeId) {
      query.andWhere('p.store_id = :storeId', { storeId });
    }

    query.orderBy('p.created_at', 'DESC').take(limit).skip(offset);

    const products = await query.getMany();

    return this.transformToCarouselProducts(products);
  }

  // ============================================
  // BEST SELLING
  // ============================================

  /**
   * Get best selling products based on pre-computed scores
   * Score = (order_count * 5) + (add_to_cart_count * 2) + (view_count)
   */
  async getBestSelling(options: CarouselOptions = {}): Promise<CarouselProduct[]> {
    const { limit = 12, offset = 0, storeId } = options;

    const query = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.variants', 'v')
      .where('p.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('p.best_selling_score > 0');

    if (storeId) {
      query.andWhere('p.store_id = :storeId', { storeId });
    }

    query.orderBy('p.best_selling_score', 'DESC').addOrderBy('p.created_at', 'DESC').take(limit).skip(offset);

    const products = await query.getMany();

    if (!products.length) {
      // Fallback to new arrivals if no stats
      return this.getNewArrivals(options);
    }

    return this.transformToCarouselProducts(products);
  }

  // ============================================
  // TRENDING
  // ============================================

  /**
   * Get trending products based on recent activity with time decay
   */
  async getTrending(options: CarouselOptions = {}): Promise<CarouselProduct[]> {
    const { limit = 12, offset = 0, storeId } = options;

    const query = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.variants', 'v')
      .where('p.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('p.trending_score > 0');

    if (storeId) {
      query.andWhere('p.store_id = :storeId', { storeId });
    }

    query.orderBy('p.trending_score', 'DESC').addOrderBy('p.created_at', 'DESC').take(limit).skip(offset);

    const products = await query.getMany();

    if (!products.length) {
      return this.getBestSelling(options);
    }

    return this.transformToCarouselProducts(products);
  }

  // ============================================
  // RELATED PRODUCTS
  // ============================================

  /**
   * Get related products for a given product
   * Uses multiple strategies and blends results
   */
  async getRelatedProducts(productId: number, limit: number = 12): Promise<CarouselProduct[]> {
    const [frequentlyBought, sameCategory, sameCollection] = await Promise.all([
      this.getFrequentlyBoughtTogether(productId, Math.ceil(limit / 3)),
      this.getSameCategoryProducts(productId, Math.ceil(limit / 3)),
      this.getSameCollectionProducts(productId, Math.ceil(limit / 3)),
    ]);

    // Merge and deduplicate
    const seen = new Set<number>();
    const merged: CarouselProduct[] = [];

    for (const product of [...frequentlyBought, ...sameCategory, ...sameCollection]) {
      if (!seen.has(product.product_id) && merged.length < limit) {
        seen.add(product.product_id);
        merged.push(product);
      }
    }

    return merged;
  }

  /**
   * Get products frequently bought together
   */
  async getFrequentlyBoughtTogether(productId: number, limit: number = 6): Promise<CarouselProduct[]> {
    const sourceProduct = await this.productRepo.findOne({ where: { product_id: productId } });
    const relatedIds = (sourceProduct?.copurchased_product_ids ?? []).slice(0, limit);

    if (!relatedIds.length) {
      return [];
    }

    const products = await this.productRepo.find({
      where: {
        product_id: In(relatedIds),
        status: ProductStatus.ACTIVE,
      },
      relations: ['variants'],
    });

    return this.transformToCarouselProducts(products);
  }

  /**
   * Get products in same category
   */
  async getSameCategoryProducts(productId: number, limit: number = 6): Promise<CarouselProduct[]> {
    const sourceProduct = await this.productRepo.findOne({
      where: { product_id: productId },
      select: { category_id: true },
    });

    const categoryId = sourceProduct?.category_id ?? null;
    if (!categoryId) {
      return [];
    }

    const relatedRows = await this.productRepo
      .createQueryBuilder('p')
      .where('p.category_id = :categoryId', { categoryId })
      .andWhere('p.product_id != :productId', { productId })
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .select('p.product_id', 'product_id')
      .addOrderBy('p.created_at', 'DESC')
      .take(limit)
      .getRawMany();

    const relatedIds = relatedRows.map((row) => Number(row.product_id)).filter((id) => Number.isInteger(id) && id > 0);

    if (!relatedIds.length) {
      return [];
    }

    const products = await this.productRepo.find({
      where: { product_id: In(relatedIds) },
      relations: ['variants'],
    });

    return this.transformToCarouselProducts(products);
  }

  /**
   * Get products in same collection
   */
  async getSameCollectionProducts(productId: number, limit: number = 6): Promise<CarouselProduct[]> {
    // Get product's collections
    const productCollections = await this.collectionService['collectionProductRepo'].find({
      where: { product_id: productId },
    });

    if (!productCollections.length) {
      return [];
    }

    const collectionIds = productCollections.map((pc) => pc.collection_id);

    // Get other products in same collections
    const relatedLinks = await this.collectionService['collectionProductRepo']
      .createQueryBuilder('cp')
      .innerJoin('cp.product', 'p')
      .where('cp.collection_id IN (:...collectionIds)', { collectionIds })
      .andWhere('cp.product_id != :productId', { productId })
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .select('DISTINCT cp.product_id', 'product_id')
      .take(limit)
      .getRawMany();

    const relatedIds = relatedLinks.map((r) => r.product_id);

    if (!relatedIds.length) {
      return [];
    }

    const products = await this.productRepo.find({
      where: { product_id: In(relatedIds) },
      relations: ['variants'],
    });

    return this.transformToCarouselProducts(products);
  }

  // ============================================
  // COLLECTION CAROUSEL
  // ============================================

  async getCollectionCarousel(collectionId: number, limit: number = 12): Promise<CarouselProduct[]> {
    const { products } = await this.collectionService.getCollectionProducts(collectionId, limit);
    return this.transformToCarouselProducts(products);
  }

  // ============================================
  // EVENT TRACKING
  // ============================================

  /**
   * Record product event (view, add_to_cart, purchase)
   */
  async recordEvent(productId: number, eventType: 'view' | 'add_to_cart' | 'purchase', count: number = 1): Promise<void> {
    const product = await this.productRepo.findOne({ where: { product_id: productId } });
    if (!product) {
      return;
    }

    const nextEventCounters = {
      ...(product.event_counters ?? {}),
      [eventType]: Math.max(0, Number(product.event_counters?.[eventType] ?? 0) + count),
    };

    const nextOrderCount = product.order_count + (eventType === 'purchase' ? count : 0);
    const nextOrderCount30d = product.order_count_30d + (eventType === 'purchase' ? count : 0);
    const nextViewCount = product.view_count + (eventType === 'view' ? count : 0);
    const nextViewCount30d = product.view_count_30d + (eventType === 'view' ? count : 0);
    const nextAddToCartCount = product.add_to_cart_count + (eventType === 'add_to_cart' ? count : 0);
    const nextAddToCartCount30d = product.add_to_cart_count_30d + (eventType === 'add_to_cart' ? count : 0);

    const nextBestSellingScore = nextOrderCount30d * 5 + nextAddToCartCount30d * 2 + nextViewCount30d;
    const nextTrendingScore = nextOrderCount30d * 10 + nextAddToCartCount30d * 5 + nextViewCount30d * 2;

    await this.productRepo.update(
      { product_id: productId },
      {
        event_counters: nextEventCounters,
        order_count: nextOrderCount,
        order_count_30d: nextOrderCount30d,
        view_count: nextViewCount,
        view_count_30d: nextViewCount30d,
        add_to_cart_count: nextAddToCartCount,
        add_to_cart_count_30d: nextAddToCartCount30d,
        best_selling_score: nextBestSellingScore,
        trending_score: nextTrendingScore,
        last_computed_at: new Date(),
      },
    );
  }

  /**
   * Record co-purchase when order is completed
   */
  async recordCopurchase(productIds: number[]): Promise<void> {
    if (productIds.length < 2) return;

    const uniqueProductIds = [...new Set(productIds)];
    const products = await this.productRepo.find({
      where: { product_id: In(uniqueProductIds) },
    });

    const copurchaseMap = new Map<number, Set<number>>();
    for (const product of products) {
      copurchaseMap.set(product.product_id, new Set(product.copurchased_product_ids ?? []));
    }

    for (let i = 0; i < uniqueProductIds.length; i++) {
      for (let j = i + 1; j < uniqueProductIds.length; j++) {
        const a = uniqueProductIds[i];
        const b = uniqueProductIds[j];
        copurchaseMap.get(a)?.add(b);
        copurchaseMap.get(b)?.add(a);
      }
    }

    await Promise.all(
      [...copurchaseMap.entries()].map(([productId, related]) =>
        this.productRepo.update(
          { product_id: productId },
          {
            copurchased_product_ids: [...related],
          },
        ),
      ),
    );
  }

  // ============================================
  // SCORE COMPUTATION (Background Job)
  // ============================================

  /**
   * Compute best selling and trending scores for all products
   * Should be run as a scheduled job (e.g., every 15 minutes)
   */
  async computeProductScores(): Promise<void> {
    const products = await this.productRepo.find({
      where: { status: ProductStatus.ACTIVE },
    });

    await Promise.all(
      products.map((product) => {
        const nextBestSellingScore = product.order_count_30d * 5 + product.add_to_cart_count_30d * 2 + product.view_count_30d;
        const nextTrendingScore = product.order_count_30d * 10 + product.add_to_cart_count_30d * 5 + product.view_count_30d * 2;

        return this.productRepo.update(
          { product_id: product.product_id },
          {
            best_selling_score: nextBestSellingScore,
            trending_score: nextTrendingScore,
            last_computed_at: new Date(),
          },
        );
      }),
    );
  }

  // ============================================
  // TRANSFORM HELPERS
  // ============================================

  private async transformToCarouselProducts(products: Product[]): Promise<CarouselProduct[]> {
    // For inventory, we'd need to join through Variant -> InventoryItem -> InventoryLevel
    // Simplified approach: assume in_stock = true unless we want to do a more complex query
    // In production, you'd likely cache stock status or use a materialized view

    return products.map((product) => {
      const variant = product.variants?.[0];
      // Default to true - in production, implement proper stock checking
      const hasStock = true;

      return {
        product_id: product.product_id,
        title: product.title,
        handle: product.handle,
        thumbnail_url: product.primary_image_url ?? (Array.isArray(product.media_urls) ? product.media_urls[0] : undefined),
        price: variant?.price,
        compare_at_price: variant?.compare_at_price,
        in_stock: hasStock,
      };
    });
  }
}
