import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Public storefront product option' })
export class PublicStorefrontOption {
  @Field()
  name: string;

  @Field(() => [String])
  values: string[];
}

@ObjectType({ description: 'Public storefront product variant' })
export class PublicStorefrontVariant {
  @Field(() => Int)
  variant_id: number;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  sku?: string;

  @Field({ nullable: true })
  option1_value?: string;

  @Field({ nullable: true })
  option2_value?: string;

  @Field({ nullable: true })
  option3_value?: string;

  @Field({ nullable: true })
  price?: string;

  @Field({ nullable: true })
  compare_at_price?: string;

  @Field(() => [String], { nullable: true })
  media_urls?: string[];

  @Field({ nullable: true })
  inventory_available?: number;
}

@ObjectType({ description: 'Public storefront product summary' })
export class PublicStorefrontProduct {
  @Field(() => Int)
  product_id: number;

  @Field(() => Int)
  store_id: number;

  @Field()
  store_name: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  brand?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ description: 'SEO handle or fallback identifier' })
  handle: string;

  @Field({ nullable: true, description: 'Best available product image URL' })
  image_url?: string;

  @Field(() => [String], { nullable: true, description: 'All available product media URLs ordered by position' })
  media_urls?: string[];

  @Field({ nullable: true, description: 'Default/min variant price' })
  price?: string;

  @Field({ nullable: true, description: 'Default/min compare-at price' })
  compare_at_price?: string;

  @Field(() => [PublicStorefrontOption], { nullable: true })
  options?: PublicStorefrontOption[];

  @Field(() => [PublicStorefrontVariant], { nullable: true })
  variants?: PublicStorefrontVariant[];
}

@ObjectType({ description: 'Public storefront store with product list' })
export class PublicStorefrontStore {
  @Field(() => Int)
  store_id: number;

  @Field()
  name: string;

  @Field(() => [PublicStorefrontProduct])
  products: PublicStorefrontProduct[];
}
