/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantService } from './variant.service';
import { VariantResolver } from './variant.resolver';
import { Variant } from './entities';
import { Product, ProductOption } from '../catalog/entities';
import { InventoryItemEntity, InventoryLevelEntity } from '../inventory/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Variant, Product, ProductOption, InventoryItemEntity, InventoryLevelEntity])],
  providers: [VariantService, VariantResolver],
  exports: [VariantService],
})
export class VariantModule {}
