/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { ProductService } from './product.service';
import { Category, Product, ProductOption, Store } from './entities';
import { CreateProductInput, UpdateProductInput, ProductFilterInput, PaginationInput, AddProductOptionInput, CreateStoreInput } from './dto';
import { PaginatedProductsResponse } from './dto/product.response';

@Resolver(() => Product)
export class ProductResolver {
  constructor(private readonly productService: ProductService) {}

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

  @UseGuards(JwtAuthGuard)
  @Query(() => Store, { description: 'Get a single store by ID' })
  async store(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<Store> {
    return this.productService.findStore(id, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => [Category], { description: 'Get categories, optionally filtered by store' })
  async categories(
    @Args('storeId', { type: () => Int, nullable: true }) storeId: number | undefined,
    @CurrentUser() currentUser: User,
  ): Promise<Category[]> {
    return this.productService.findCategories(storeId, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Store, { description: 'Create a new store' })
  async createStore(@Args('input') input: CreateStoreInput, @CurrentUser() currentUser: User): Promise<Store> {
    return this.productService.createStore(input, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => PaginatedProductsResponse, { description: 'Get paginated list of products' })
  async products(
    @Args('filter', { nullable: true }) filter?: ProductFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @CurrentUser() currentUser?: User,
  ): Promise<PaginatedProductsResponse> {
    return this.productService.findAll(filter || {}, pagination || {}, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => Product, { description: 'Get a single product by ID' })
  async product(@Args('id', { type: () => Int }) id: number, @CurrentUser() currentUser: User): Promise<Product> {
    return this.productService.findOne(id, currentUser);
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => Product, { description: 'Get a single product by SEO handle' })
  async productByHandle(@Args('handle') handle: string, @CurrentUser() currentUser: User): Promise<Product> {
    return this.productService.findByHandle(handle, currentUser);
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
