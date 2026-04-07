/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryResolver } from './inventory.resolver';
import { InventoryAdjustment, InventoryItemEntity, InventoryLevelEntity, InventoryReservation, Location } from './entities';
import { Variant } from '../variant/entities';
import { Store } from '../catalog/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Location, InventoryItemEntity, InventoryLevelEntity, InventoryAdjustment, InventoryReservation, Variant, Store])],
  providers: [InventoryService, InventoryResolver],
  exports: [InventoryService],
})
export class InventoryModule {}
