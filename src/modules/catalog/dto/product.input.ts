/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { InputType, Field, GraphQLISODateTime, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsInt, IsArray, ValidateNested, IsBoolean } from 'class-validator';
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

@InputType({ description: 'Input for a product metafield entry' })
export class ProductMetafieldInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  key: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  value?: string;
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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  primary_image_url?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  primaryImageUrl?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media_urls?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

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

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  categoryId?: number;

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

  @Field(() => [ProductMetafieldInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductMetafieldInput)
  metafields?: ProductMetafieldInput[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  country_codes?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countryCodes?: string[];
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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  primary_image_url?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  primaryImageUrl?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media_urls?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @Field(() => ProductStatus, { nullable: true })
  @IsOptional()
  status?: ProductStatus;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  category_ids?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  categoryId?: number;

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

  @Field(() => [ProductMetafieldInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductMetafieldInput)
  metafields?: ProductMetafieldInput[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  country_codes?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countryCodes?: string[];
}

@InputType({ description: 'Input for managing store-level available countries' })
export class SetStoreCountriesInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field(() => [String])
  @IsArray()
  @IsString({ each: true })
  country_codes: string[];
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

@InputType({ description: 'CSV-style row for bulk product import' })
export class BulkImportProductRowInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsInt()
  row_number?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  handle?: string;

  @Field({ nullable: true, description: 'For variant rows, parent product handle/slug.' })
  @IsOptional()
  @IsString()
  parent_handle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  category_slugs?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option1_name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option1_values?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option2_name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option2_values?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option3_name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option3_values?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  brand?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  media_urls?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  media_url?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country_codes?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_option1_value?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_option2_value?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_option3_value?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_sku?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_barcode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_price?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_compare_at_price?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_cost_price?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_weight?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_weight_unit?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_inventory_policy?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_inventory?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_media_urls?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variant_media_url?: string;
}

@InputType({ description: 'Bulk import request payload' })
export class BulkImportProductsInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field(() => [BulkImportProductRowInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportProductRowInput)
  rows: BulkImportProductRowInput[];

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  continue_on_error?: boolean;
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

@InputType({ description: 'Metafield definition for a category' })
export class CategoryMetafieldDefinitionInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  key: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  label?: string;

  @Field({ nullable: true, defaultValue: 'text' })
  @IsOptional()
  @IsString()
  type?: string;
}

@InputType({ description: 'Input for creating a category' })
export class CreateCategoryInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  store_id?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  slug?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  parent_id?: number | null;

  @Field(() => [CategoryMetafieldDefinitionInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CategoryMetafieldDefinitionInput)
  metafields?: CategoryMetafieldDefinitionInput[];
}

@InputType({ description: 'Input for updating a category' })
export class UpdateCategoryInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  slug?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  parent_id?: number | null;

  @Field(() => [CategoryMetafieldDefinitionInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CategoryMetafieldDefinitionInput)
  metafields?: CategoryMetafieldDefinitionInput[];
}

@InputType({ description: 'Input for creating a brand' })
export class CreateBrandInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field(() => Int)
  @IsInt()
  store_id: number;
}

@InputType({ description: 'Input for updating a brand' })
export class UpdateBrandInput {
  @Field(() => Int)
  @IsInt()
  brand_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;
}
