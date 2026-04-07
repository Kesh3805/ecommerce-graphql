/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { ObjectType, Field, Int } from '@nestjs/graphql';
import { InventoryLevelEntity, InventoryAdjustment } from '../entities';

@ObjectType({ description: 'Response for inventory adjustment' })
export class AdjustInventoryResponse {
  @Field(() => InventoryLevelEntity)
  level: InventoryLevelEntity;

  @Field(() => InventoryAdjustment)
  adjustment: InventoryAdjustment;
}

@ObjectType({ description: 'Response for inventory transfer' })
export class TransferInventoryResponse {
  @Field(() => InventoryLevelEntity)
  from_level: InventoryLevelEntity;

  @Field(() => InventoryLevelEntity)
  to_level: InventoryLevelEntity;

  @Field(() => Int)
  quantity_transferred: number;
}
