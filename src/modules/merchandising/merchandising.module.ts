/**
 * Merchandising Module
 * Provides collections, carousels, and product discovery features
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionService } from './collection.service';
import { CarouselService } from './carousel.service';
import { CollectionResolver } from './collection.resolver';
import { Collection, CollectionProduct, CollectionRule } from './entities';
import { Product, Category, ProductCategory, ProductCountryAvailability } from '../catalog/entities';
import { Variant } from '../variant/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Merchandising entities
      Collection,
      CollectionProduct,
      CollectionRule,
      // Catalog entities (for queries)
      Product,
      Category,
      ProductCategory,
      ProductCountryAvailability,
      // Variant entity
      Variant,
    ]),
  ],
  providers: [CollectionService, CarouselService, CollectionResolver],
  exports: [CollectionService, CarouselService],
})
export class MerchandisingModule {}
