/**
 * Collection Resolver
 * GraphQL API for collections and carousels
 */

import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Int, ResolveField, Parent } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { CollectionService } from './collection.service';
import { CarouselService } from './carousel.service';
import { Collection, CollectionRule } from './entities';
import { Product } from '../catalog/entities';
import { CreateCollectionInput, UpdateCollectionInput, AddProductsToCollectionInput, CollectionRuleInput, CollectionFilterInput, CarouselProduct } from './dto';

@Resolver(() => Collection)
export class CollectionResolver {
  constructor(
    private collectionService: CollectionService,
    private carouselService: CarouselService,
  ) {}

  // ============================================
  // COLLECTION QUERIES
  // ============================================

  @Query(() => Collection, { nullable: true, description: 'Get collection by ID' })
  async collection(@Args('collectionId', { type: () => Int }) collectionId: number): Promise<Collection | null> {
    try {
      return await this.collectionService.findById(collectionId);
    } catch {
      return null;
    }
  }

  @Query(() => Collection, { nullable: true, description: 'Get collection by slug' })
  async collectionBySlug(@Args('storeId', { type: () => Int }) storeId: number, @Args('slug') slug: string): Promise<Collection | null> {
    try {
      return await this.collectionService.findBySlug(storeId, slug);
    } catch {
      return null;
    }
  }

  @Query(() => [Collection], { description: 'Get all collections' })
  async collections(@Args('filter', { nullable: true }) filter?: CollectionFilterInput): Promise<Collection[]> {
    return this.collectionService.findAll(filter || {});
  }

  // ============================================
  // CAROUSEL QUERIES (Public)
  // ============================================

  @Query(() => [CarouselProduct], { description: 'Get new arrivals carousel' })
  async newArrivals(
    @Args('storeId', { type: () => Int, nullable: true }) storeId?: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 12 }) limit?: number,
  ): Promise<CarouselProduct[]> {
    return this.carouselService.getNewArrivals({ storeId, limit });
  }

  @Query(() => [CarouselProduct], { description: 'Get best selling products carousel' })
  async bestSelling(
    @Args('storeId', { type: () => Int, nullable: true }) storeId?: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 12 }) limit?: number,
  ): Promise<CarouselProduct[]> {
    return this.carouselService.getBestSelling({ storeId, limit });
  }

  @Query(() => [CarouselProduct], { description: 'Get trending products carousel' })
  async trending(
    @Args('storeId', { type: () => Int, nullable: true }) storeId?: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 12 }) limit?: number,
  ): Promise<CarouselProduct[]> {
    return this.carouselService.getTrending({ storeId, limit });
  }

  @Query(() => [CarouselProduct], { description: 'Get related products for a product' })
  async relatedProducts(
    @Args('productId', { type: () => Int }) productId: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 12 }) limit?: number,
  ): Promise<CarouselProduct[]> {
    return this.carouselService.getRelatedProducts(productId, limit);
  }

  @Query(() => [CarouselProduct], { description: 'Get frequently bought together products' })
  async frequentlyBoughtTogether(
    @Args('productId', { type: () => Int }) productId: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 6 }) limit?: number,
  ): Promise<CarouselProduct[]> {
    return this.carouselService.getFrequentlyBoughtTogether(productId, limit);
  }

  @Query(() => [CarouselProduct], { description: 'Get collection carousel products' })
  async collectionCarousel(
    @Args('collectionId', { type: () => Int }) collectionId: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 12 }) limit?: number,
  ): Promise<CarouselProduct[]> {
    return this.carouselService.getCollectionCarousel(collectionId, limit);
  }

  // ============================================
  // COLLECTION MUTATIONS (Protected)
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Collection, { description: 'Create a new collection' })
  async createCollection(@Args('input') input: CreateCollectionInput, @CurrentUser() _user: User): Promise<Collection> {
    return this.collectionService.create(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Collection, { description: 'Update a collection' })
  async updateCollection(@Args('input') input: UpdateCollectionInput, @CurrentUser() _user: User): Promise<Collection> {
    return this.collectionService.update(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a collection' })
  async deleteCollection(@Args('collectionId', { type: () => Int }) collectionId: number, @CurrentUser() _user: User): Promise<boolean> {
    return this.collectionService.delete(collectionId);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Collection, { description: 'Add products to a manual collection' })
  async addProductsToCollection(@Args('input') input: AddProductsToCollectionInput, @CurrentUser() _user: User): Promise<Collection> {
    return this.collectionService.addProducts(input.collection_id, input.product_ids);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Collection, { description: 'Remove products from a collection' })
  async removeProductsFromCollection(
    @Args('collectionId', { type: () => Int }) collectionId: number,
    @Args('productIds', { type: () => [Int] }) productIds: number[],
    @CurrentUser() _user: User,
  ): Promise<Collection> {
    return this.collectionService.removeProducts(collectionId, productIds);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Collection, { description: 'Reorder products in a collection' })
  async reorderCollectionProducts(
    @Args('collectionId', { type: () => Int }) collectionId: number,
    @Args('productIds', { type: () => [Int] }) productIds: number[],
    @CurrentUser() _user: User,
  ): Promise<Collection> {
    return this.collectionService.reorderProducts(collectionId, productIds);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Collection, { description: 'Set rules for an automated collection' })
  async setCollectionRules(
    @Args('collectionId', { type: () => Int }) collectionId: number,
    @Args('rules', { type: () => [CollectionRuleInput] }) rules: CollectionRuleInput[],
    @CurrentUser() _user: User,
  ): Promise<Collection> {
    return this.collectionService.setRules(collectionId, rules);
  }

  // ============================================
  // EVENT TRACKING MUTATION
  // ============================================

  @Mutation(() => Boolean, { description: 'Record a product event (view, add_to_cart, purchase)' })
  async recordProductEvent(
    @Args('productId', { type: () => Int }) productId: number,
    @Args('eventType') eventType: string,
    @Args('count', { type: () => Int, nullable: true, defaultValue: 1 }) count?: number,
  ): Promise<boolean> {
    if (!['view', 'add_to_cart', 'purchase'].includes(eventType)) {
      return false;
    }
    await this.carouselService.recordEvent(productId, eventType as 'view' | 'add_to_cart' | 'purchase', count);
    return true;
  }

  // ============================================
  // FIELD RESOLVERS
  // ============================================

  @ResolveField(() => [Product], { description: 'Collection products' })
  async products(
    @Parent() collection: Collection,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 }) offset?: number,
    @Args('countryCode', { type: () => String, nullable: true }) countryCode?: string,
  ): Promise<Product[]> {
    try {
      const { products } = await this.collectionService.getCollectionProducts(collection.collection_id, limit, offset, countryCode);
      return products;
    } catch {
      return [];
    }
  }

  @ResolveField(() => Int, { description: 'Total product count in collection' })
  async product_count(@Parent() collection: Collection): Promise<number> {
    if (typeof collection.product_count === 'number') {
      return collection.product_count;
    }

    try {
      return await this.collectionService.getProductCount(collection.collection_id);
    } catch {
      return 0;
    }
  }

  @ResolveField(() => [CollectionRule], { nullable: true, description: 'Collection rules' })
  async rules(@Parent() collection: Collection): Promise<CollectionRule[] | undefined> {
    if (collection.rules) {
      return collection.rules;
    }

    try {
      const full = await this.collectionService.findById(collection.collection_id);
      return full.rules;
    } catch {
      return [];
    }
  }
}
