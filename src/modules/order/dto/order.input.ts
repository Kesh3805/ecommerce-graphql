import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Length } from 'class-validator';

@InputType()
export class CreateOrderInput {
  @Field(() => Int)
  @IsInt()
  cart_id: number;

  @Field(() => String)
  @IsString()
  @Length(8, 200)
  idempotency_key: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  currency?: string;
}
