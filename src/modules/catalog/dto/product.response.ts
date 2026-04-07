/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Product } from '../entities/product.entity';

@ObjectType({ description: 'Paginated product response' })
export class PaginatedProductsResponse {
  @Field(() => [Product])
  items: Product[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  totalPages: number;

  @Field()
  hasNextPage: boolean;

  @Field()
  hasPreviousPage: boolean;
}
