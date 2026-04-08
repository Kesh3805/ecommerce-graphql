/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductResolver } from './product.resolver';
import { Category, OptionValue, Product, ProductCategory, ProductCountryAvailability, ProductMetafield, ProductOption, Store } from './entities';
import { InventoryLevelEntity } from '../inventory/entities';
import { Variant } from '../variant/entities';
import { VariantModule } from '../variant/variant.module';

@Module({
  imports: [
    VariantModule,
    TypeOrmModule.forFeature([
      Store,
      Category,
      Product,
      ProductOption,
      OptionValue,
      ProductCategory,
      ProductMetafield,
      ProductCountryAvailability,
      Variant,
      InventoryLevelEntity,
    ]),
  ],
  providers: [ProductService, ProductResolver],
  exports: [ProductService],
})
export class CatalogModule {}
