/**
 * Storefront Resolver
 * GraphQL API for homepage, pages, and sections
 */

import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { StorefrontService } from './storefront.service';
import { StorefrontPage, PageSection, HeroBanner } from './entities';
import { CreatePageInput, UpdatePageInput, CreateSectionInput, UpdateSectionInput, CreateHeroBannerInput, HomepageResponse } from './dto';

@Resolver(() => StorefrontPage)
export class StorefrontResolver {
  constructor(private storefrontService: StorefrontService) {}

  // ============================================
  // PUBLIC QUERIES
  // ============================================

  @Query(() => HomepageResponse, { nullable: true, description: 'Get homepage with resolved sections' })
  async homepage(@Args('storeId', { type: () => Int }) storeId: number): Promise<HomepageResponse | null> {
    return this.storefrontService.getHomepage(storeId);
  }

  @Query(() => StorefrontPage, { nullable: true, description: 'Get page by ID' })
  async storefrontPage(@Args('pageId', { type: () => Int }) pageId: number): Promise<StorefrontPage | null> {
    try {
      return await this.storefrontService.findPageById(pageId);
    } catch {
      return null;
    }
  }

  // ============================================
  // PAGE MUTATIONS (Protected)
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Mutation(() => StorefrontPage, { description: 'Create a new storefront page' })
  async createStorefrontPage(@Args('input') input: CreatePageInput, @CurrentUser() _user: User): Promise<StorefrontPage> {
    return this.storefrontService.createPage(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => StorefrontPage, { description: 'Update a storefront page' })
  async updateStorefrontPage(@Args('input') input: UpdatePageInput, @CurrentUser() _user: User): Promise<StorefrontPage> {
    return this.storefrontService.updatePage(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => StorefrontPage, { description: 'Publish a storefront page' })
  async publishStorefrontPage(@Args('pageId', { type: () => Int }) pageId: number, @CurrentUser() _user: User): Promise<StorefrontPage> {
    return this.storefrontService.publishPage(pageId);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => StorefrontPage, { description: 'Unpublish a storefront page' })
  async unpublishStorefrontPage(@Args('pageId', { type: () => Int }) pageId: number, @CurrentUser() _user: User): Promise<StorefrontPage> {
    return this.storefrontService.unpublishPage(pageId);
  }

  // ============================================
  // SECTION MUTATIONS (Protected)
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Mutation(() => PageSection, { description: 'Create a new page section' })
  async createPageSection(@Args('input') input: CreateSectionInput, @CurrentUser() _user: User): Promise<PageSection> {
    return this.storefrontService.createSection(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => PageSection, { description: 'Update a page section' })
  async updatePageSection(@Args('input') input: UpdateSectionInput, @CurrentUser() _user: User): Promise<PageSection> {
    return this.storefrontService.updateSection(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a page section' })
  async deletePageSection(@Args('sectionId', { type: () => Int }) sectionId: number, @CurrentUser() _user: User): Promise<boolean> {
    return this.storefrontService.deleteSection(sectionId);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => StorefrontPage, { description: 'Reorder page sections' })
  async reorderPageSections(
    @Args('pageId', { type: () => Int }) pageId: number,
    @Args('sectionIds', { type: () => [Int] }) sectionIds: number[],
    @CurrentUser() _user: User,
  ): Promise<StorefrontPage> {
    return this.storefrontService.reorderSections(pageId, sectionIds);
  }

  // ============================================
  // HERO BANNER MUTATIONS (Protected)
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Mutation(() => HeroBanner, { description: 'Create a new hero banner' })
  async createHeroBanner(@Args('input') input: CreateHeroBannerInput, @CurrentUser() _user: User): Promise<HeroBanner> {
    return this.storefrontService.createHeroBanner(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a hero banner' })
  async deleteHeroBanner(@Args('bannerId', { type: () => Int }) bannerId: number, @CurrentUser() _user: User): Promise<boolean> {
    return this.storefrontService.deleteHeroBanner(bannerId);
  }

  // ============================================
  // SECTION ASSOCIATION MUTATIONS (Protected)
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Add a collection to a section' })
  async addCollectionToSection(
    @Args('sectionId', { type: () => Int }) sectionId: number,
    @Args('collectionId', { type: () => Int }) collectionId: number,
    @CurrentUser() _user: User,
  ): Promise<boolean> {
    await this.storefrontService.addCollectionToSection(sectionId, collectionId);
    return true;
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Add a category to a section' })
  async addCategoryToSection(
    @Args('sectionId', { type: () => Int }) sectionId: number,
    @Args('categoryId', { type: () => Int }) categoryId: number,
    @Args('customImageUrl', { nullable: true }) customImageUrl?: string,
    @CurrentUser() _user?: User,
  ): Promise<boolean> {
    await this.storefrontService.addCategoryToSection(sectionId, categoryId, customImageUrl);
    return true;
  }
}
