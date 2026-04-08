import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { ProductStatus } from '../../../common/enums/ecommerce.enums';
import { Variant } from '../../variant/entities/variant.entity';
import { ProductMedia } from '../../media/entities';

@ObjectType()
@Entity('Store')
@Index(['slug'])
export class Store {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'store_id' })
  store_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  slug?: string;

  @Field()
  @Column({ type: 'uuid', name: 'owner_user_id' })
  owner_user_id: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => Product, (product) => product.store)
  products: Relation<Product[]>;

  @OneToMany(() => ProductCountryAvailability, (availability) => availability.store)
  country_availability?: Relation<ProductCountryAvailability[]>;

  @BeforeInsert()
  @BeforeUpdate()
  setSlugFromName(): void {
    this.slug =
      this.name
        ?.toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || this.slug;
  }
}

@ObjectType({ description: 'Category entity' })
@Entity('Category')
@Index(['slug'], { unique: true })
@Index(['parent_id'])
export class Category {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'category_id' })
  category_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  parent_id?: number | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @ManyToOne(() => Category, (category) => category.children, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: Relation<Category>;

  @OneToMany(() => Category, (category) => category.parent)
  children?: Relation<Category[]>;

  @OneToMany(() => ProductCategory, (pc) => pc.category)
  product_links?: Relation<ProductCategory[]>;
}

@ObjectType({ description: 'Product SEO metadata' })
export class ProductSEO {
  @Field(() => Int)
  product_seo_id: number;

  @Field(() => Int)
  product_id: number;

  @Field()
  handle: string;

  @Field({ nullable: true })
  meta_title?: string;

  @Field({ nullable: true })
  meta_description?: string;

  @Field({ nullable: true })
  og_title?: string;

  @Field({ nullable: true })
  og_description?: string;

  @Field({ nullable: true })
  og_image?: string;
}

@ObjectType({ description: 'Generic product metafield entry' })
@Entity('Metafield')
@Index(['owner_type', 'owner_id'])
@Index(['owner_type', 'owner_id', 'key'])
export class ProductMetafield {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Field()
  @Column({ type: 'varchar', length: 64 })
  owner_type: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  owner_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  value?: string;
}

@ObjectType({ description: 'Country-level product availability mapping' })
@Entity('ProductCountryAvailability')
@Index(['store_id', 'country_code'])
@Index(['product_id', 'country_code'], { unique: true, where: '"product_id" IS NOT NULL' })
@Index(['store_id', 'country_code'], { unique: true, where: '"product_id" IS NULL' })
export class ProductCountryAvailability {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @ManyToOne(() => Store, (store) => store.country_availability, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'store_id' })
  store: Relation<Store>;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  product_id?: number | null;

  @ManyToOne(() => Product, (product) => product.country_availability, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: Relation<Product>;

  @Field()
  @Column({ type: 'varchar', length: 2 })
  country_code: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  is_available: boolean;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

@ObjectType({ description: 'Product entity' })
@Entity('Product')
@Index(['store_id'])
@Index(['status'])
@Index(['published_at'])
@Index(['store_id', 'status', 'published_at'])
@Index(['handle'], { unique: true })
export class Product {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'product_id' })
  product_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  brand?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  handle?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  meta_title?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  meta_description?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  og_title?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  og_description?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  og_image?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  primary_image_url?: string;

  @Field(() => [String], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  media_urls?: string[];

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  order_count: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  order_count_30d: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  view_count: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  view_count_30d: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  add_to_cart_count: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  add_to_cart_count_30d: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  total_revenue: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  revenue_30d: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  best_selling_score: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  trending_score: number;

  @Column({ type: 'jsonb', nullable: true })
  event_counters?: Record<string, number>;

  @Field(() => [Int], { nullable: true })
  @Column({ type: 'int', array: true, default: () => "'{}'" })
  related_product_ids?: number[];

  @Field(() => [Int], { nullable: true })
  @Column({ type: 'int', array: true, default: () => "'{}'" })
  copurchased_product_ids?: number[];

  @Field({ nullable: true })
  @Column({ type: 'timestamp', default: () => 'NOW()' })
  last_computed_at?: Date;

  @Field(() => ProductStatus)
  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  published_at?: Date;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @ManyToOne(() => Store, (store) => store.products, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'store_id' })
  store: Relation<Store>;

  @Field(() => ProductSEO, { nullable: true })
  seo?: ProductSEO;

  @Field(() => [ProductOption], { nullable: true })
  @OneToMany(() => ProductOption, (option) => option.product, { cascade: true })
  options?: Relation<ProductOption[]>;

  @OneToMany(() => ProductCategory, (pc) => pc.product, { cascade: true })
  category_links?: Relation<ProductCategory[]>;

  @Field(() => [Category], { nullable: true })
  categories?: Category[];

  @Field(() => [Variant], { nullable: true })
  @OneToMany(() => Variant, (variant) => variant.product)
  variants?: Relation<Variant[]>;

  @Field(() => [ProductMedia], { nullable: true })
  media?: ProductMedia[];

  @Field(() => [ProductMetafield], { nullable: true })
  metafields?: ProductMetafield[];

  @OneToMany(() => ProductCountryAvailability, (availability) => availability.product)
  country_availability?: Relation<ProductCountryAvailability[]>;

  @Field(() => [String], { nullable: true })
  country_codes?: string[];
}

@ObjectType({ description: 'Product option' })
@Entity('ProductOption')
@Index(['product_id', 'position'], { unique: true })
export class ProductOption {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'option_id' })
  option_id: number;

  @Field()
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  position: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  product_id: number;

  @ManyToOne(() => Product, (product) => product.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Field(() => [OptionValue], { nullable: true })
  @OneToMany(() => OptionValue, (value) => value.option, { cascade: true })
  values?: Relation<OptionValue[]>;
}

@ObjectType({ description: 'Option value' })
@Entity('OptionValue')
@Index(['option_id', 'position'], { unique: true })
export class OptionValue {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'value_id' })
  value_id: number;

  @Field()
  @Column({ type: 'varchar', length: 120 })
  value: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  position: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  option_id: number;

  @ManyToOne(() => ProductOption, (option) => option.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option: Relation<ProductOption>;
}

@Entity('ProductCategory')
@Index(['product_id', 'category_id'], { unique: true })
@Index(['category_id'])
export class ProductCategory {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ type: 'int' })
  product_id: number;

  @Column({ type: 'int' })
  category_id: number;

  @ManyToOne(() => Product, (product) => product.category_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @ManyToOne(() => Category, (category) => category.product_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Relation<Category>;
}
