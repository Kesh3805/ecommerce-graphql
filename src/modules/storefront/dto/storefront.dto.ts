/**
 * Storefront DTOs
 */

import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageType, SectionType, TextPosition, CarouselAlgorithm } from '../entities';

// ============================================
// INPUT TYPES
// ============================================

@InputType()
export class CreatePageInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field(() => PageType)
  @IsEnum(PageType)
  page_type: PageType;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @Field()
  @IsString()
  @MaxLength(255)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  meta_title?: string;

  @Field({ nullable: true })
  @IsOptional()
  meta_description?: string;
}

@InputType()
export class UpdatePageInput {
  @Field(() => Int)
  @IsInt()
  page_id: number;

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
  meta_title?: string;

  @Field({ nullable: true })
  @IsOptional()
  meta_description?: string;
}

@InputType()
export class CreateSectionInput {
  @Field(() => Int)
  @IsInt()
  page_id: number;

  @Field(() => SectionType)
  @IsEnum(SectionType)
  section_type: SectionType;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  position?: number;

  @Field({ nullable: true })
  @IsOptional()
  config?: string; // JSON string
}

@InputType()
export class UpdateSectionInput {
  @Field(() => Int)
  @IsInt()
  section_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  position?: number;

  @Field({ nullable: true })
  @IsOptional()
  is_visible?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  config?: string; // JSON string
}

@InputType()
export class CreateHeroBannerInput {
  @Field(() => Int)
  @IsInt()
  section_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cta_text?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cta_link?: string;

  @Field()
  @IsString()
  desktop_image_url: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  mobile_image_url?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  video_url?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  position?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  text_color?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  overlay_opacity?: number;

  @Field(() => TextPosition, { nullable: true })
  @IsOptional()
  @IsEnum(TextPosition)
  text_position?: TextPosition;
}

@InputType()
export class ProductCarouselConfigInput {
  @Field(() => CarouselAlgorithm)
  @IsEnum(CarouselAlgorithm)
  algorithm: CarouselAlgorithm;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  collection_id?: number;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  product_ids?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  max_products?: number;

  @Field({ nullable: true })
  @IsOptional()
  show_price?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  show_rating?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  show_add_to_cart?: boolean;
}

// ============================================
// RESPONSE TYPES (ordered to avoid forward references)
// ============================================

@ObjectType()
export class HeroBannerResponse {
  @Field(() => Int)
  banner_id: number;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  subtitle?: string;

  @Field({ nullable: true })
  cta_text?: string;

  @Field({ nullable: true })
  cta_link?: string;

  @Field()
  desktop_image_url: string;

  @Field({ nullable: true })
  mobile_image_url?: string;

  @Field({ nullable: true })
  video_url?: string;

  @Field(() => Int)
  position: number;

  @Field()
  text_color: string;

  @Field(() => Float)
  overlay_opacity: number;

  @Field(() => TextPosition)
  text_position: TextPosition;
}

@ObjectType()
export class CarouselProductResponse {
  @Field(() => Int)
  product_id: number;

  @Field()
  title: string;

  @Field({ nullable: true })
  handle?: string;

  @Field({ nullable: true })
  thumbnail_url?: string;

  @Field(() => Float, { nullable: true })
  price?: number;

  @Field(() => Float, { nullable: true })
  compare_at_price?: number;

  @Field(() => Float, { nullable: true })
  rating?: number;

  @Field(() => Int, { nullable: true })
  review_count?: number;

  @Field()
  in_stock: boolean;
}

@ObjectType()
export class CollectionSummary {
  @Field(() => Int)
  collection_id: number;

  @Field()
  name: string;

  @Field()
  slug: string;

  @Field({ nullable: true })
  image_url?: string;

  @Field({ nullable: true })
  description?: string;
}

@ObjectType()
export class CategoryGridItem {
  @Field(() => Int)
  category_id: number;

  @Field()
  name: string;

  @Field()
  slug: string;

  @Field({ nullable: true })
  image_url?: string;

  @Field(() => Int)
  product_count: number;
}

@ObjectType()
export class ResolvedSection {
  @Field(() => Int)
  section_id: number;

  @Field(() => SectionType)
  section_type: SectionType;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  subtitle?: string;

  @Field(() => Int)
  position: number;

  @Field()
  is_visible: boolean;

  @Field(() => String, { nullable: true })
  config?: string;

  // Optional data fields - populated based on section_type
  @Field(() => [HeroBannerResponse], { nullable: true })
  banners?: HeroBannerResponse[];

  @Field(() => [CarouselProductResponse], { nullable: true })
  products?: CarouselProductResponse[];

  @Field(() => [CollectionSummary], { nullable: true })
  collections?: CollectionSummary[];

  @Field(() => [CategoryGridItem], { nullable: true })
  categories?: CategoryGridItem[];
}

@ObjectType()
export class HomepageResponse {
  @Field(() => Int)
  page_id: number;

  @Field()
  name: string;

  @Field({ nullable: true })
  meta_title?: string;

  @Field({ nullable: true })
  meta_description?: string;

  @Field(() => [ResolvedSection])
  sections: ResolvedSection[];
}
