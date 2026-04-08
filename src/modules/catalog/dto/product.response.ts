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

@ObjectType({ description: 'Per-row bulk import result' })
export class BulkImportProductRowResult {
  @Field(() => Int)
  row_number: number;

  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => Int, { nullable: true })
  product_id?: number;

  @Field({ nullable: true })
  handle?: string;
}

@ObjectType({ description: 'Bulk import summary and row results' })
export class BulkImportProductsResponse {
  @Field(() => Int)
  total_rows: number;

  @Field(() => Int)
  success_count: number;

  @Field(() => Int)
  failure_count: number;

  @Field(() => [BulkImportProductRowResult])
  results: BulkImportProductRowResult[];
}

@ObjectType({ description: 'Brand record' })
export class BrandRecordResponse {
  @Field(() => Int)
  brand_id: number;

  @Field(() => Int)
  store_id: number;

  @Field({ nullable: true })
  store_name?: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  slug?: string;

  @Field()
  created_at: Date;

  @Field()
  updated_at: Date;
}
