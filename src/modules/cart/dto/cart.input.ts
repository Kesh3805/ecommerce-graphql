import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

@InputType()
export class CreateCartInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  customer_id?: string;
}

@InputType()
export class AddToCartInput {
  @Field(() => Int)
  @IsInt()
  cart_id: number;

  @Field(() => Int)
  @IsInt()
  variant_id: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity: number;
}

@InputType()
export class UpdateCartItemInput {
  @Field(() => Int)
  @IsInt()
  cart_item_id: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity: number;
}
