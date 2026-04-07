import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, MinLength, Max, Min } from 'class-validator';

@InputType()
export class ProductSearchInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field()
  @IsString()
  @MinLength(1, { message: 'Search query cannot be empty' })
  @MaxLength(200, { message: 'Search query cannot exceed 200 characters' })
  query: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number;
}
