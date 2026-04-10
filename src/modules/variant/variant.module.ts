/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantService } from './variant.service';
import { VariantResolver } from './variant.resolver';
import { Variant } from './entities';
import { CatalogModule } from '../catalog/catalog.module';
import { Product, ProductOption } from '../catalog/entities';
import { InventoryItemEntity, InventoryLevelEntity } from '../inventory/entities';

@Module({
  imports: [forwardRef(() => CatalogModule), TypeOrmModule.forFeature([Variant, Product, ProductOption, InventoryItemEntity, InventoryLevelEntity])],
  providers: [VariantService, VariantResolver],
  exports: [VariantService],
})
export class VariantModule {}
