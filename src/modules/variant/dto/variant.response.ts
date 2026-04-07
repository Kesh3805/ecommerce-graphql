/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Variant } from '../entities';

@ObjectType({ description: 'Response for variant generation' })
export class GenerateVariantsResponse {
  @Field(() => Int)
  created: number;

  @Field(() => [Variant])
  variants: Variant[];
}

@ObjectType({ description: 'Response for bulk variant update' })
export class BulkUpdateResponse {
  @Field(() => Int)
  updated: number;

  @Field(() => [Int])
  variant_ids: number[];
}
