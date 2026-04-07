/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { ProductService } from './product.service';
import { Product, ProductOption } from './entities';
import { CreateProductInput, UpdateProductInput, ProductFilterInput, PaginationInput, AddProductOptionInput } from './dto';
import { PaginatedProductsResponse } from './dto/product.response';

@Resolver(() => Product)
export class ProductResolver {
  constructor(private readonly productService: ProductService) {}

  @Query(() => PaginatedProductsResponse, { description: 'Get paginated list of products' })
  async products(
    @Args('filter', { nullable: true }) filter?: ProductFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedProductsResponse> {
    return this.productService.findAll(filter || {}, pagination || {});
  }

  @Query(() => Product, { description: 'Get a single product by ID' })
  async product(@Args('id', { type: () => Int }) id: number): Promise<Product> {
    return this.productService.findOne(id);
  }

  @Query(() => Product, { description: 'Get a single product by SEO handle' })
  async productByHandle(@Args('handle') handle: string): Promise<Product> {
    return this.productService.findByHandle(handle);
  }

  @Query(() => PaginatedProductsResponse, { description: 'Get products by category' })
  async categoryProducts(
    @Args('categoryId', { type: () => Int }) categoryId: number,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedProductsResponse> {
    return this.productService.findByCategory(categoryId, pagination || {});
  }

  @Mutation(() => Product, { description: 'Create a new product' })
  async createProduct(@Args('input') input: CreateProductInput): Promise<Product> {
    return this.productService.create(input);
  }

  @Mutation(() => Product, { description: 'Update an existing product' })
  async updateProduct(@Args('input') input: UpdateProductInput): Promise<Product> {
    return this.productService.update(input);
  }

  @Mutation(() => Boolean, { description: 'Delete a product by ID' })
  async deleteProduct(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
    return this.productService.delete(id);
  }

  @Mutation(() => ProductOption, { description: 'Add an option to a product' })
  async addProductOption(@Args('input') input: AddProductOptionInput): Promise<ProductOption> {
    return this.productService.addOption(input);
  }

  @Mutation(() => Boolean, { description: 'Remove an option from a product' })
  async removeProductOption(@Args('optionId', { type: () => Int }) optionId: number): Promise<boolean> {
    return this.productService.removeOption(optionId);
  }

  @Mutation(() => Product, { description: 'Publish a product (set status to ACTIVE)' })
  async publishProduct(@Args('id', { type: () => Int }) id: number): Promise<Product> {
    return this.productService.publishProduct(id);
  }

  @Mutation(() => Product, { description: 'Archive a product' })
  async archiveProduct(@Args('id', { type: () => Int }) id: number): Promise<Product> {
    return this.productService.archiveProduct(id);
  }
}
