import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString } from 'class-validator';

@InputType()
export class ProductSearchInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field()
  @IsString()
  query: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  limit?: number;
}
