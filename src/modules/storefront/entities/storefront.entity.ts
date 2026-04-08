/**
 * Storefront Layout Entities
 * Backend-driven homepage and landing page configuration
 */

import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import { Store, Category } from '../../catalog/entities';
import { Collection } from '../../merchandising/entities';

// ============================================
// ENUMS
// ============================================

export enum PageType {
  HOMEPAGE = 'HOMEPAGE',
  LANDING = 'LANDING',
  CATEGORY_LANDING = 'CATEGORY_LANDING',
}

export enum SectionType {
  HERO_BANNER = 'HERO_BANNER',
  PRODUCT_CAROUSEL = 'PRODUCT_CAROUSEL',
  COLLECTION_CAROUSEL = 'COLLECTION_CAROUSEL',
  CATEGORY_GRID = 'CATEGORY_GRID',
  RICH_TEXT = 'RICH_TEXT',
  IMAGE_GRID = 'IMAGE_GRID',
}

export enum CarouselAlgorithm {
  NEW_ARRIVALS = 'NEW_ARRIVALS',
  BEST_SELLING = 'BEST_SELLING',
  TRENDING = 'TRENDING',
  RECOMMENDED = 'RECOMMENDED',
  COLLECTION = 'COLLECTION',
  MANUAL = 'MANUAL',
}

export enum TextPosition {
  LEFT = 'LEFT',
  CENTER = 'CENTER',
  RIGHT = 'RIGHT',
}

registerEnumType(PageType, { name: 'PageType' });
registerEnumType(SectionType, { name: 'SectionType' });
registerEnumType(CarouselAlgorithm, { name: 'CarouselAlgorithm' });
registerEnumType(TextPosition, { name: 'TextPosition' });

// ============================================
// STOREFRONT PAGE
// ============================================

@ObjectType({ description: 'Storefront page configuration' })
@Entity('StorefrontPage')
@Index(['store_id', 'page_type', 'slug'], { unique: true })
@Index(['store_id', 'is_published'])
export class StorefrontPage {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'page_id' })
  page_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @Field(() => PageType)
  @Column({ type: 'enum', enum: PageType })
  page_type: PageType;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  slug?: string;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Field()
  @Column({ type: 'boolean', default: false })
  is_published: boolean;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  published_at?: Date;

  // SEO
  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  meta_title?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  meta_description?: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store: Relation<Store>;

  @Field(() => [PageSection], { nullable: true })
  @OneToMany(() => PageSection, (section) => section.page, { cascade: true })
  sections?: Relation<PageSection[]>;
}

// ============================================
// PAGE SECTION
// ============================================

@ObjectType({ description: 'Page section configuration' })
@Entity('PageSection')
@Index(['page_id', 'position'])
@Index(['page_id', 'is_visible'])
export class PageSection {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'section_id' })
  section_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  page_id: number;

  @Field(() => SectionType)
  @Column({ type: 'enum', enum: SectionType })
  section_type: SectionType;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  subtitle?: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  position: number;

  @Field()
  @Column({ type: 'boolean', default: true })
  is_visible: boolean;

  // JSON configuration for section-specific settings
  @Field(() => String, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  config?: Record<string, unknown>;

  // Scheduling
  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  visible_from?: Date;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  visible_until?: Date;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => StorefrontPage, (page) => page.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page: Relation<StorefrontPage>;

  @OneToMany(() => HeroBanner, (banner) => banner.section, { cascade: true })
  banners?: Relation<HeroBanner[]>;

  @OneToMany(() => SectionCollection, (sc) => sc.section, { cascade: true })
  collection_links?: Relation<SectionCollection[]>;

  @OneToMany(() => SectionCategory, (sc) => sc.section, { cascade: true })
  category_links?: Relation<SectionCategory[]>;
}

// ============================================
// HERO BANNER
// ============================================

@ObjectType({ description: 'Hero banner content' })
@Entity('HeroBanner')
@Index(['section_id', 'position'])
export class HeroBanner {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'banner_id' })
  banner_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  section_id: number;

  // Content
  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  subtitle?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  cta_text?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  cta_link?: string;

  // Media
  @Field()
  @Column({ type: 'varchar', length: 500 })
  desktop_image_url: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  mobile_image_url?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  video_url?: string;

  // Display
  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  position: number;

  @Field()
  @Column({ type: 'varchar', length: 20, default: '#FFFFFF' })
  text_color: string;

  @Field(() => Float)
  @Column({ type: 'float', default: 0.3 })
  overlay_opacity: number;

  @Field(() => TextPosition)
  @Column({ type: 'enum', enum: TextPosition, default: TextPosition.CENTER })
  text_position: TextPosition;

  // Scheduling
  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  visible_from?: Date;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  visible_until?: Date;

  // Relations
  @ManyToOne(() => PageSection, (section) => section.banners, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: Relation<PageSection>;
}

// ============================================
// SECTION-COLLECTION LINK
// ============================================

@Entity('SectionCollection')
@Index(['section_id', 'collection_id'], { unique: true })
export class SectionCollection {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ type: 'int' })
  section_id: number;

  @Column({ type: 'int' })
  collection_id: number;

  @Column({ type: 'int', default: 0 })
  position: number;

  @ManyToOne(() => PageSection, (section) => section.collection_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: Relation<PageSection>;

  @ManyToOne(() => Collection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection: Relation<Collection>;
}

// ============================================
// SECTION-CATEGORY LINK
// ============================================

@Entity('SectionCategory')
@Index(['section_id', 'category_id'], { unique: true })
export class SectionCategory {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ type: 'int' })
  section_id: number;

  @Column({ type: 'int' })
  category_id: number;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  custom_image_url?: string;

  @ManyToOne(() => PageSection, (section) => section.category_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: Relation<PageSection>;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Relation<Category>;
}
