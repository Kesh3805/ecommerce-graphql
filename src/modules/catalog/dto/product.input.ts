/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { InputType, Field, GraphQLISODateTime, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../../../common/enums/ecommerce.enums';

@InputType({ description: 'SEO input for product' })
export class CreateProductSEOInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  handle: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  meta_title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  meta_description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  og_title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  ogTitle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  og_description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  ogDescription?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  og_image?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  ogImage?: string;
}

@InputType({ description: 'Input for creating a new product' })
export class CreateProductInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  brand?: string;

  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  category_ids?: number[];

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @Field(() => ProductStatus, { nullable: true })
  @IsOptional()
  status?: ProductStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  published_at?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  publishedAt?: Date;

  @Field(() => CreateProductSEOInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProductSEOInput)
  seo?: CreateProductSEOInput;
}

@InputType({ description: 'Input for updating a product' })
export class UpdateProductInput {
  @Field(() => Int)
  @IsInt()
  product_id: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  productId?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  brand?: string;

  @Field(() => ProductStatus, { nullable: true })
  @IsOptional()
  status?: ProductStatus;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  category_ids?: number[];

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  published_at?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  publishedAt?: Date;

  @Field(() => CreateProductSEOInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProductSEOInput)
  seo?: CreateProductSEOInput;
}

@InputType({ description: 'Filter options for product queries' })
export class ProductFilterInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  store_id?: number;

  @Field(() => ProductStatus, { nullable: true })
  @IsOptional()
  status?: ProductStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;
}

@InputType({ description: 'Pagination input' })
export class PaginationInput {
  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  limit?: number;
}

@InputType({ description: 'Input for adding a product option' })
export class AddProductOptionInput {
  @Field(() => Int)
  @IsInt()
  product_id: number;

  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field(() => [String])
  @IsArray()
  @IsString({ each: true })
  values: string[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  position?: number;
}

@InputType({ description: 'Input for creating a store' })
export class CreateStoreInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  owner_user_id: string;
}
