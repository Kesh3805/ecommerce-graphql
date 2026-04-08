/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Int, Info } from '@nestjs/graphql';
import { GraphQLResolveInfo, SelectionNode } from 'graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { ProductService } from './product.service';
import { Category, Product, ProductOption, Store } from './entities';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductFilterInput,
  PaginationInput,
  AddProductOptionInput,
  CreateStoreInput,
  CreateCategoryInput,
  SetStoreCountriesInput,
  UpdateCategoryInput,
  PublicStorefrontProduct,
  PublicStorefrontStore,
  BulkImportProductsInput,
  CreateBrandInput,
  UpdateBrandInput,
} from './dto';
import { BrandRecordResponse, BulkImportProductsResponse, PaginatedProductsResponse } from './dto/product.response';

@Resolver(() => Product)
export class ProductResolver {
  constructor(private readonly productService: ProductService) {}

  private selectionHasField(info: GraphQLResolveInfo, fieldName: string): boolean {
    const visitedFragments = new Set<string>();

    const walk = (selections: readonly SelectionNode[]): boolean => {
      for (const selection of selections) {
        if (selection.kind === 'Field') {
          if (selection.name.value === fieldName) {
            return true;
          }

          if (selection.selectionSet && walk(selection.selectionSet.selections)) {
            return true;
          }
        }

        if (selection.kind === 'InlineFragment' && walk(selection.selectionSet.selections)) {
          return true;
        }

        if (selection.kind === 'FragmentSpread') {
          const fragmentName = selection.name.value;
          if (visitedFragments.has(fragmentName)) {
            continue;
          }

          visitedFragments.add(fragmentName);
          const fragment = info.fragments[fragmentName];
          if (fragment && walk(fragment.selectionSet.selections)) {
            return true;
          }
        }
      }

      return false;
    };

    const rootSelections = info.fieldNodes.flatMap((node) => node.selectionSet?.selections ?? []);
    return walk(rootSelections);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => [Store], { description: 'Get current user stores' })
  async myStores(@CurrentUser() currentUser: User): Promise<Store[]> {
    return this.productService.findStores(currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => [Store], { description: 'Get all stores' })
  async stores(@CurrentUser() currentUser: User): Promise<Store[]> {
    return this.productService.findStores(currentUser);
  }

  @Query(() => [PublicStorefrontStore], { description: 'Public storefront stores with active products' })
  async publicStores(
    @Args('storeLimit', { type: () => Int, nullable: true, defaultValue: 6 }) storeLimit?: number,
    @Args('productLimit', { type: () => Int, nullable: true, defaultValue: 8 }) productLimit?: number,
    @Args('countryCode', { type: () => String, nullable: true }) countryCode?: string,
  ): Promise<PublicStorefrontStore[]> {
    return this.productService.findPublicStorefrontData(storeLimit ?? 6, productLimit ?? 8, countryCode);
  }

  @Query(() => PublicStorefrontStore, { nullable: true, description: 'Public storefront store by slug with active products' })
  async publicStoreBySlug(
    @Args('slug') slug: string,
    @Args('productLimit', { type: () => Int, nullable: true, defaultValue: 12 }) productLimit?: number,
    @Args('countryCode', { type: () => String, nullable: true }) countryCode?: string,
  ): Promise<PublicStorefrontStore | null> {
    return this.productService.findPublicStorefrontStoreBySlug(slug, productLimit ?? 12, countryCode);
  }

  @Query(() => PublicStorefrontProduct, { nullable: true, description: 'Public storefront product by handle' })
  async publicProductByHandle(
    @Args('handle') handle: string,
    @Args('countryCode', { type: () => String, nullable: true }) countryCode?: string,
  ): Promise<PublicStorefrontProduct | null> {
    return this.productService.findPublicProductByHandle(handle, countryCode);
  }

  @Query(() => [PublicStorefrontProduct], { description: 'Public storefront product search powered by Elasticsearch' })
  async publicSearchProducts(
    @Args('query') query: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 24 }) limit?: number,
    @Args('countryCode', { type: () => String, nullable: true }) countryCode?: string,
    @Args('storeSlug', { type: () => String, nullable: true }) storeSlug?: string,
    @Args('storeId', { type: () => Int, nullable: true }) storeId?: number,
  ): Promise<PublicStorefrontProduct[]> {
    return this.productService.searchPublicProducts(query, limit ?? 24, countryCode, storeSlug, storeId);
  }

  @Query(() => [String], { description: 'Get available storefront countries for a store' })
  async availableCountries(@Args('storeId', { type: () => Int }) storeId: number): Promise<string[]> {
    return this.productService.findAvailableCountriesByStore(storeId);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => Store, { description: 'Get a single store by ID' })
  async store(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<Store> {
    return this.productService.findStore(id, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => [Category], { description: 'Get categories, optionally filtered by store' })
  async categories(@Args('storeId', { type: () => Int, nullable: true }) storeId: number | undefined, @CurrentUser() currentUser: User): Promise<Category[]> {
    return this.productService.findCategories(storeId, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => [BrandRecordResponse], { description: 'Get brands for accessible stores' })
  async brands(
    @Args('storeId', { type: () => Int, nullable: true }) storeId: number | undefined,
    @CurrentUser() currentUser: User,
  ): Promise<BrandRecordResponse[]> {
    return this.productService.findBrands(storeId, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Category, { description: 'Create a category' })
  async createCategory(@Args('input') input: CreateCategoryInput, @CurrentUser() currentUser: User): Promise<Category> {
    return this.productService.createCategory(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Category, { description: 'Update a category' })
  async updateCategory(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateCategoryInput,
    @CurrentUser() currentUser: User,
  ): Promise<Category> {
    return this.productService.updateCategory(id, input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a category' })
  async deleteCategory(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<boolean> {
    return this.productService.deleteCategory(id, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => BrandRecordResponse, { description: 'Create a brand for a store' })
  async createBrand(@Args('input') input: CreateBrandInput, @CurrentUser() currentUser: User): Promise<BrandRecordResponse> {
    return this.productService.createBrand(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => BrandRecordResponse, { description: 'Update an existing brand' })
  async updateBrand(@Args('input') input: UpdateBrandInput, @CurrentUser() currentUser: User): Promise<BrandRecordResponse> {
    return this.productService.updateBrand(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a brand' })
  async deleteBrand(@Args('brandId', { type: () => Int }) brandId: number, @CurrentUser() currentUser: User): Promise<boolean> {
    return this.productService.deleteBrand(brandId, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Store, { description: 'Create a new store' })
  async createStore(@Args('input') input: CreateStoreInput, @CurrentUser() currentUser: User): Promise<Store> {
    return this.productService.createStore(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => [String], { description: 'Set store-level available countries' })
  async setStoreCountries(@Args('input') input: SetStoreCountriesInput, @CurrentUser() currentUser: User): Promise<string[]> {
    return this.productService.setStoreCountries(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => PaginatedProductsResponse, { description: 'Get paginated list of products' })
  async products(
    @Args('filter', { nullable: true }) filter?: ProductFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @CurrentUser() currentUser?: User,
    @Info() info?: GraphQLResolveInfo,
  ): Promise<PaginatedProductsResponse> {
    const includeCategories = info ? this.selectionHasField(info, 'categories') : true;
    const includeOptions = info ? this.selectionHasField(info, 'options') : true;
    const includeMetafields = info ? this.selectionHasField(info, 'metafields') : true;
    const includeCountryCodes = info ? this.selectionHasField(info, 'country_codes') : true;

    return this.productService.findAll(filter || {}, pagination || {}, currentUser, {
      includeCategories,
      includeOptions,
      includeMetafields,
      includeCountryCodes,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => Product, { description: 'Get a single product by ID' })
  async product(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User, @Info() info?: GraphQLResolveInfo): Promise<Product> {
    const includeVariants = info ? this.selectionHasField(info, 'variants') : false;
    return this.productService.findOne(id, currentUser, includeVariants);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => Product, { description: 'Get a single product by SEO handle' })
  async productByHandle(@Args('handle') handle: string, @CurrentUser() currentUser: User, @Info() info?: GraphQLResolveInfo): Promise<Product> {
    const includeVariants = info ? this.selectionHasField(info, 'variants') : false;
    return this.productService.findByHandle(handle, currentUser, includeVariants);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => PaginatedProductsResponse, { description: 'Get products by category' })
  async categoryProducts(
    @Args('categoryId', { type: () => Int }) categoryId: number,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @CurrentUser() currentUser?: User,
  ): Promise<PaginatedProductsResponse> {
    return this.productService.findByCategory(categoryId, pagination || {}, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Product, { description: 'Create a new product' })
  async createProduct(@Args('input') input: CreateProductInput, @CurrentUser() currentUser: User): Promise<Product> {
    return this.productService.create(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => BulkImportProductsResponse, { description: 'Bulk import products using CSV-style rows' })
  async bulkImportProducts(@Args('input') input: BulkImportProductsInput, @CurrentUser() currentUser: User): Promise<BulkImportProductsResponse> {
    return this.productService.bulkImportProducts(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Product, { description: 'Update an existing product' })
  async updateProduct(@Args('input') input: UpdateProductInput, @CurrentUser() currentUser: User): Promise<Product> {
    return this.productService.update(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a product by ID' })
  async deleteProduct(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<boolean> {
    return this.productService.delete(id, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => ProductOption, { description: 'Add an option to a product' })
  async addProductOption(@Args('input') input: AddProductOptionInput, @CurrentUser() currentUser: User): Promise<ProductOption> {
    return this.productService.addOption(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Remove an option from a product' })
  async removeProductOption(@Args('optionId', { type: () => Int }) optionId: number, @CurrentUser() currentUser: User): Promise<boolean> {
    return this.productService.removeOption(optionId, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Product, { description: 'Publish a product (set status to ACTIVE)' })
  async publishProduct(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<Product> {
    return this.productService.publishProduct(id, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Product, { description: 'Archive a product' })
  async archiveProduct(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<Product> {
    return this.productService.archiveProduct(id, currentUser);
  }
}
