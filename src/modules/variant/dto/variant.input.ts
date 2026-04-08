/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, IsNumber, IsBoolean, Min } from 'class-validator';
import { InventoryPolicy } from '../../../common/enums/ecommerce.enums';

@InputType({ description: 'Input for generating variants from product options' })
export class GenerateVariantsInput {
  @Field(() => Int)
  @IsInt()
  product_id: number;

  @Field(() => Float, { nullable: true, description: 'Default price for all generated variants' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  default_price?: number;

  @Field({ nullable: true, description: 'SKU prefix for generated variants' })
  @IsOptional()
  @IsString()
  sku_prefix?: string;

  @Field(() => Boolean, { nullable: true, description: 'Create inventory items for variants' })
  @IsOptional()
  @IsBoolean()
  create_inventory?: boolean;
}

@InputType({ description: 'Input for updating a variant' })
export class UpdateVariantInput {
  @Field(() => Int)
  @IsInt()
  variant_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  sku?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compare_at_price?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsString({ each: true })
  media_urls?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_price?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  weight_unit?: string;

  @Field(() => InventoryPolicy, { nullable: true })
  @IsOptional()
  inventory_policy?: InventoryPolicy;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

@InputType({ description: 'Input for creating a single variant manually' })
export class CreateVariantInput {
  @Field(() => Int)
  @IsInt()
  product_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option1_value?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option2_value?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  option3_value?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  sku?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compare_at_price?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsString({ each: true })
  media_urls?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_price?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  weight_unit?: string;

  @Field(() => InventoryPolicy, { nullable: true })
  @IsOptional()
  inventory_policy?: InventoryPolicy;

  @Field(() => Boolean, { nullable: true, description: 'Create inventory item for this variant' })
  @IsOptional()
  @IsBoolean()
  create_inventory?: boolean;
}

@InputType({ description: 'Input for bulk updating variant prices' })
export class BulkUpdateVariantPricesInput {
  @Field(() => [Int])
  @IsInt({ each: true })
  variant_ids: number[];

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  price: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compare_at_price?: number;
}
