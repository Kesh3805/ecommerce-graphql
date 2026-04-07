/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductResolver } from './product.resolver';
import { Category, OptionValue, Product, ProductCategory, ProductOption, ProductSEO, Store } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([Store, Category, Product, ProductSEO, ProductOption, OptionValue, ProductCategory])],
  providers: [ProductService, ProductResolver],
  exports: [ProductService],
})
export class CatalogModule {}
