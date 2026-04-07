/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantService } from './variant.service';
import { VariantResolver } from './variant.resolver';
import { Variant, VariantOptionSelection } from './entities';
import { Product, ProductOption } from '../catalog/entities';
import { InventoryItemEntity } from '../inventory/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Variant, VariantOptionSelection, Product, ProductOption, InventoryItemEntity])],
  providers: [VariantService, VariantResolver],
  exports: [VariantService],
})
export class VariantModule {}
