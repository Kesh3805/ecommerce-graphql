/**
 * Storefront Module
 * Provides homepage, pages, sections, and banner management
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorefrontService } from './storefront.service';
import { StorefrontResolver } from './storefront.resolver';
import { StorefrontPage, PageSection, HeroBanner, SectionCollection, SectionCategory } from './entities';
import { MerchandisingModule } from '../merchandising/merchandising.module';
import { Category } from '../catalog/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([StorefrontPage, PageSection, HeroBanner, SectionCollection, SectionCategory, Category]),
    forwardRef(() => MerchandisingModule),
  ],
  providers: [StorefrontService, StorefrontResolver],
  exports: [StorefrontService],
})
export class StorefrontModule {}
