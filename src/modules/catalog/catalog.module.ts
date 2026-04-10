/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductResolver } from './product.resolver';
import { Category, OptionValue, Product, ProductCountryAvailability, ProductMetafield, ProductOption, Store } from './entities';
import { InventoryLevelEntity } from '../inventory/entities';
import { Variant } from '../variant/entities';
import { VariantModule } from '../variant/variant.module';

@Module({
  imports: [
    forwardRef(() => VariantModule),
    TypeOrmModule.forFeature([
      Store,
      Category,
      Product,
      ProductOption,
      OptionValue,
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
