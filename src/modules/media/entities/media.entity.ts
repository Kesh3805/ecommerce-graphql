import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ProductMedia {
  @Field(() => Int)
  media_id: number;

  @Field(() => Int)
  product_id: number;

  @Field()
  url: string;

  @Field({ nullable: true })
  alt_text?: string;

  @Field({ nullable: true })
  type?: string;

  @Field(() => Int)
  position: number;

  @Field()
  is_cover: boolean;

  @Field()
  created_at: Date;
}

@ObjectType()
export class VariantMedia {
  @Field(() => Int)
  variant_media_id: number;

  @Field(() => Int)
  variant_id: number;

  @Field(() => Int)
  media_id: number;
}
