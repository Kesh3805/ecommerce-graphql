/**
 * Collection DTOs
 */

import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CollectionType, RuleOperator, RuleValueType } from '../entities';
import { Product } from '../../catalog/entities';

// ============================================
// INPUT TYPES
// ============================================

@InputType()
export class CreateCollectionInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field()
  @IsString()
  @MaxLength(255)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => CollectionType)
  @IsEnum(CollectionType)
  collection_type: CollectionType;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  image_url?: string;

  @Field({ nullable: true })
  @IsOptional()
  meta_title?: string;

  @Field({ nullable: true })
  @IsOptional()
  meta_description?: string;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  product_ids?: number[];

  @Field(() => [CollectionRuleInput], { nullable: true })
  @IsOptional()
  @IsArray()
  rules?: CollectionRuleInput[];
}

@InputType()
export class UpdateCollectionInput {
  @Field(() => Int)
  @IsInt()
  collection_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  image_url?: string;

  @Field({ nullable: true })
  @IsOptional()
  is_visible?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  meta_title?: string;

  @Field({ nullable: true })
  @IsOptional()
  meta_description?: string;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  product_ids?: number[];

  @Field(() => [CollectionRuleInput], { nullable: true })
  @IsOptional()
  @IsArray()
  rules?: CollectionRuleInput[];
}

@InputType()
export class CollectionRuleInput {
  @Field(() => Int)
  @IsInt()
  @Min(0)
  rule_group: number;

  @Field()
  @IsString()
  field: string;

  @Field(() => RuleOperator)
  @IsEnum(RuleOperator)
  operator: RuleOperator;

  @Field()
  @IsString()
  value: string;

  @Field(() => RuleValueType, { nullable: true })
  @IsOptional()
  @IsEnum(RuleValueType)
  value_type?: RuleValueType;
}

@InputType()
export class AddProductsToCollectionInput {
  @Field(() => Int)
  @IsInt()
  collection_id: number;

  @Field(() => [Int])
  @IsArray()
  product_ids: number[];
}

@InputType()
export class CollectionFilterInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  store_id?: number;

  @Field(() => CollectionType, { nullable: true })
  @IsOptional()
  @IsEnum(CollectionType)
  collection_type?: CollectionType;

  @Field({ nullable: true })
  @IsOptional()
  is_visible?: boolean;
}

// ============================================
// RESPONSE TYPES
// ============================================

@ObjectType()
export class CollectionProductsResponse {
  @Field(() => [Product])
  products: Product[];

  @Field(() => Int)
  total_count: number;

  @Field()
  has_more: boolean;
}

@ObjectType()
export class CarouselProduct {
  @Field(() => Int)
  product_id: number;

  @Field()
  title: string;

  @Field({ nullable: true })
  thumbnail_url?: string;

  @Field({ nullable: true })
  price?: number;

  @Field({ nullable: true })
  compare_at_price?: number;

  @Field({ nullable: true })
  handle?: string;

  @Field({ nullable: true })
  rating?: number;

  @Field({ nullable: true })
  review_count?: number;

  @Field()
  in_stock: boolean;
}

@ObjectType()
export class CarouselResponse {
  @Field()
  carousel_type: string;

  @Field({ nullable: true })
  title?: string;

  @Field(() => [CarouselProduct])
  products: CarouselProduct[];

  @Field(() => Int)
  total_count: number;
}
