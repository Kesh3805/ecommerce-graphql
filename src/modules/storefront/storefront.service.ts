/**
 * Storefront Service
 * Handles homepage layout, page sections, and content management
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StorefrontPage, PageSection, HeroBanner, SectionCollection, SectionCategory, PageType, SectionType, CarouselAlgorithm } from './entities';
import { Category } from '../catalog/entities';
import { CarouselService } from '../merchandising/carousel.service';
import { CollectionService } from '../merchandising/collection.service';
import {
  CreatePageInput,
  UpdatePageInput,
  CreateSectionInput,
  UpdateSectionInput,
  CreateHeroBannerInput,
  HomepageResponse,
  ResolvedSection,
  CarouselProductResponse,
} from './dto';

@Injectable()
export class StorefrontService {
  constructor(
    @InjectRepository(StorefrontPage)
    private pageRepo: Repository<StorefrontPage>,
    @InjectRepository(PageSection)
    private sectionRepo: Repository<PageSection>,
    @InjectRepository(HeroBanner)
    private bannerRepo: Repository<HeroBanner>,
    @InjectRepository(SectionCollection)
    private sectionCollectionRepo: Repository<SectionCollection>,
    @InjectRepository(SectionCategory)
    private sectionCategoryRepo: Repository<SectionCategory>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private carouselService: CarouselService,
    private collectionService: CollectionService,
    private dataSource: DataSource,
  ) {}

  // ============================================
  // PAGE CRUD
  // ============================================

  async createPage(input: CreatePageInput): Promise<StorefrontPage> {
    // For homepage, ensure only one per store
    if (input.page_type === PageType.HOMEPAGE) {
      const existing = await this.pageRepo.findOne({
        where: {
          store_id: input.store_id,
          page_type: PageType.HOMEPAGE,
        },
      });
      if (existing) {
        throw new BadRequestException('Homepage already exists for this store');
      }
    }

    const page = this.pageRepo.create({
      store_id: input.store_id,
      page_type: input.page_type,
      slug: input.slug,
      name: input.name,
      meta_title: input.meta_title,
      meta_description: input.meta_description,
    });

    return this.pageRepo.save(page);
  }

  async updatePage(input: UpdatePageInput): Promise<StorefrontPage> {
    const page = await this.findPageById(input.page_id);

    if (input.name !== undefined) page.name = input.name;
    if (input.slug !== undefined) page.slug = input.slug;
    if (input.meta_title !== undefined) page.meta_title = input.meta_title;
    if (input.meta_description !== undefined) page.meta_description = input.meta_description;

    return this.pageRepo.save(page);
  }

  async publishPage(pageId: number): Promise<StorefrontPage> {
    const page = await this.findPageById(pageId);
    page.is_published = true;
    page.published_at = new Date();
    return this.pageRepo.save(page);
  }

  async unpublishPage(pageId: number): Promise<StorefrontPage> {
    const page = await this.findPageById(pageId);
    page.is_published = false;
    return this.pageRepo.save(page);
  }

  async findPageById(pageId: number): Promise<StorefrontPage> {
    const page = await this.pageRepo.findOne({
      where: { page_id: pageId },
      relations: ['sections', 'sections.banners'],
    });

    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    return page;
  }

  // ============================================
  // HOMEPAGE
  // ============================================

  async getHomepage(storeId: number): Promise<HomepageResponse | null> {
    const page = await this.pageRepo.findOne({
      where: {
        store_id: storeId,
        page_type: PageType.HOMEPAGE,
        is_published: true,
      },
      relations: ['sections', 'sections.banners'],
      order: {
        sections: {
          position: 'ASC',
        },
      },
    });

    if (!page) {
      return null;
    }

    // Filter visible sections
    const now = new Date();
    const visibleSections =
      page.sections?.filter((section) => {
        if (!section.is_visible) return false;
        if (section.visible_from && section.visible_from > now) return false;
        if (section.visible_until && section.visible_until < now) return false;
        return true;
      }) || [];

    // Resolve section data
    const resolvedSections = await Promise.all(visibleSections.map((section) => this.resolveSection(section, storeId)));

    return {
      page_id: page.page_id,
      name: page.name,
      meta_title: page.meta_title,
      meta_description: page.meta_description,
      sections: resolvedSections,
    };
  }

  /**
   * Resolve section data based on section type
   */
  private async resolveSection(section: PageSection, storeId: number): Promise<ResolvedSection> {
    const base: ResolvedSection = {
      section_id: section.section_id,
      section_type: section.section_type,
      title: section.title,
      subtitle: section.subtitle,
      position: section.position,
      is_visible: section.is_visible,
      config: section.config ? JSON.stringify(section.config) : undefined,
    };

    switch (section.section_type) {
      case SectionType.HERO_BANNER:
        return this.resolveHeroBannerSection(section, base);

      case SectionType.PRODUCT_CAROUSEL:
        return this.resolveProductCarouselSection(section, storeId, base);

      case SectionType.COLLECTION_CAROUSEL:
        return this.resolveCollectionCarouselSection(section, base);

      case SectionType.CATEGORY_GRID:
        return this.resolveCategoryGridSection(section, base);

      default:
        return base;
    }
  }

  private async resolveHeroBannerSection(section: PageSection, base: ResolvedSection): Promise<ResolvedSection> {
    const banners =
      section.banners?.filter((banner) => {
        const now = new Date();
        if (banner.visible_from && banner.visible_from > now) return false;
        if (banner.visible_until && banner.visible_until < now) return false;
        return true;
      }) || [];

    banners.sort((a, b) => a.position - b.position);

    return {
      ...base,
      banners: banners.map((b) => ({
        banner_id: b.banner_id,
        title: b.title,
        subtitle: b.subtitle,
        cta_text: b.cta_text,
        cta_link: b.cta_link,
        desktop_image_url: b.desktop_image_url,
        mobile_image_url: b.mobile_image_url,
        video_url: b.video_url,
        position: b.position,
        text_color: b.text_color,
        overlay_opacity: b.overlay_opacity,
        text_position: b.text_position,
      })),
    };
  }

  private async resolveProductCarouselSection(section: PageSection, storeId: number, base: ResolvedSection): Promise<ResolvedSection> {
    const config = section.config as {
      algorithm?: CarouselAlgorithm;
      collection_id?: number;
      product_ids?: number[];
      max_products?: number;
    };

    const limit = config?.max_products || 12;
    let products: CarouselProductResponse[] = [];

    switch (config?.algorithm) {
      case CarouselAlgorithm.NEW_ARRIVALS:
        products = await this.carouselService.getNewArrivals({ storeId, limit });
        break;

      case CarouselAlgorithm.BEST_SELLING:
        products = await this.carouselService.getBestSelling({ storeId, limit });
        break;

      case CarouselAlgorithm.TRENDING:
        products = await this.carouselService.getTrending({ storeId, limit });
        break;

      case CarouselAlgorithm.COLLECTION:
        if (config.collection_id) {
          products = await this.carouselService.getCollectionCarousel(config.collection_id, limit);
        }
        break;

      case CarouselAlgorithm.MANUAL:
        if (config.product_ids?.length) {
          // Fetch specific products
          products = await this.carouselService.getNewArrivals({ storeId, limit });
        }
        break;

      default:
        products = await this.carouselService.getNewArrivals({ storeId, limit });
    }

    return {
      ...base,
      products,
    };
  }

  private async resolveCollectionCarouselSection(section: PageSection, base: ResolvedSection): Promise<ResolvedSection> {
    const links = await this.sectionCollectionRepo.find({
      where: { section_id: section.section_id },
      relations: ['collection'],
      order: { position: 'ASC' },
    });

    const collections = links
      .filter((l) => l.collection?.is_visible)
      .map((l) => ({
        collection_id: l.collection.collection_id,
        name: l.collection.name,
        slug: l.collection.slug,
        image_url: l.collection.image_url,
        description: l.collection.description,
      }));

    return {
      ...base,
      collections,
    };
  }

  private async resolveCategoryGridSection(section: PageSection, base: ResolvedSection): Promise<ResolvedSection> {
    const links = await this.sectionCategoryRepo.find({
      where: { section_id: section.section_id },
      relations: ['category'],
      order: { position: 'ASC' },
    });

    const categories = await Promise.all(
      links.map(async (l) => {
        // Get product count
        const count = await this.dataSource.getRepository('Product').count({ where: { category_id: l.category_id } });

        return {
          category_id: l.category_id,
          name: l.category.name,
          slug: l.category.slug,
          image_url: l.custom_image_url || (l.category.metadata as Record<string, string>)?.image_url,
          product_count: count,
        };
      }),
    );

    return {
      ...base,
      categories,
    } as ResolvedSection;
  }

  // ============================================
  // SECTION CRUD
  // ============================================

  async createSection(input: CreateSectionInput): Promise<PageSection> {
    // Get max position
    const maxPosition = await this.sectionRepo
      .createQueryBuilder('s')
      .where('s.page_id = :pageId', { pageId: input.page_id })
      .select('MAX(s.position)', 'max')
      .getRawOne();

    const position = input.position ?? (maxPosition?.max || 0) + 1;

    const section = this.sectionRepo.create({
      page_id: input.page_id,
      section_type: input.section_type,
      title: input.title,
      subtitle: input.subtitle,
      position,
      config: input.config ? JSON.parse(input.config) : undefined,
    });

    return this.sectionRepo.save(section);
  }

  async updateSection(input: UpdateSectionInput): Promise<PageSection> {
    const section = await this.sectionRepo.findOne({
      where: { section_id: input.section_id },
    });

    if (!section) {
      throw new NotFoundException(`Section ${input.section_id} not found`);
    }

    if (input.title !== undefined) section.title = input.title;
    if (input.subtitle !== undefined) section.subtitle = input.subtitle;
    if (input.position !== undefined) section.position = input.position;
    if (input.is_visible !== undefined) section.is_visible = input.is_visible;
    if (input.config !== undefined) section.config = JSON.parse(input.config);

    return this.sectionRepo.save(section);
  }

  async deleteSection(sectionId: number): Promise<boolean> {
    const result = await this.sectionRepo.delete(sectionId);
    return (result.affected ?? 0) > 0;
  }

  async reorderSections(pageId: number, sectionIds: number[]): Promise<StorefrontPage> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let i = 0; i < sectionIds.length; i++) {
        await queryRunner.manager.update(PageSection, { section_id: sectionIds[i], page_id: pageId }, { position: i });
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return this.findPageById(pageId);
  }

  // ============================================
  // HERO BANNER CRUD
  // ============================================

  async createHeroBanner(input: CreateHeroBannerInput): Promise<HeroBanner> {
    // Verify section exists and is hero_banner type
    const section = await this.sectionRepo.findOne({
      where: { section_id: input.section_id },
    });

    if (!section) {
      throw new NotFoundException(`Section ${input.section_id} not found`);
    }

    if (section.section_type !== SectionType.HERO_BANNER) {
      throw new BadRequestException('Section is not a hero banner section');
    }

    // Get max position
    const maxPosition = await this.bannerRepo
      .createQueryBuilder('b')
      .where('b.section_id = :sectionId', { sectionId: input.section_id })
      .select('MAX(b.position)', 'max')
      .getRawOne();

    const position = input.position ?? (maxPosition?.max || 0) + 1;

    const banner = this.bannerRepo.create({
      section_id: input.section_id,
      title: input.title,
      subtitle: input.subtitle,
      cta_text: input.cta_text,
      cta_link: input.cta_link,
      desktop_image_url: input.desktop_image_url,
      mobile_image_url: input.mobile_image_url,
      video_url: input.video_url,
      position,
      text_color: input.text_color || '#FFFFFF',
      overlay_opacity: input.overlay_opacity ?? 0.3,
      text_position: input.text_position,
    });

    return this.bannerRepo.save(banner);
  }

  async deleteHeroBanner(bannerId: number): Promise<boolean> {
    const result = await this.bannerRepo.delete(bannerId);
    return (result.affected ?? 0) > 0;
  }

  // ============================================
  // SECTION ASSOCIATIONS
  // ============================================

  async addCollectionToSection(sectionId: number, collectionId: number): Promise<void> {
    const maxPosition = await this.sectionCollectionRepo
      .createQueryBuilder('sc')
      .where('sc.section_id = :sectionId', { sectionId })
      .select('MAX(sc.position)', 'max')
      .getRawOne();

    const link = this.sectionCollectionRepo.create({
      section_id: sectionId,
      collection_id: collectionId,
      position: (maxPosition?.max || 0) + 1,
    });

    await this.sectionCollectionRepo.save(link);
  }

  async addCategoryToSection(sectionId: number, categoryId: number, customImageUrl?: string): Promise<void> {
    const maxPosition = await this.sectionCategoryRepo
      .createQueryBuilder('sc')
      .where('sc.section_id = :sectionId', { sectionId })
      .select('MAX(sc.position)', 'max')
      .getRawOne();

    const link = this.sectionCategoryRepo.create({
      section_id: sectionId,
      category_id: categoryId,
      position: (maxPosition?.max || 0) + 1,
      custom_image_url: customImageUrl,
    });

    await this.sectionCategoryRepo.save(link);
  }
}
