import { Field, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { ProductStatus } from '../../../common/enums/ecommerce.enums';
import { Variant } from '../../variant/entities/variant.entity';

@ObjectType()
@Entity('Store')
export class Store {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'store_id' })
  store_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

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

@ObjectType({ description: 'Product entity' })
@Entity('Product')
@Index(['store_id'])
@Index(['status'])
@Index(['published_at'])
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
  @OneToOne(() => ProductSEO, (seo) => seo.product, { cascade: true })
  seo?: Relation<ProductSEO>;

  @Field(() => [ProductOption], { nullable: true })
  @OneToMany(() => ProductOption, (option) => option.product, { cascade: true })
  options?: Relation<ProductOption[]>;

  @OneToMany(() => ProductCategory, (pc) => pc.product, { cascade: true })
  category_links?: Relation<ProductCategory[]>;

  @Field(() => [Category], { nullable: true })
  categories?: Category[];

  @OneToMany(() => Variant, (variant) => variant.product)
  variants?: Relation<Variant[]>;
}

@ObjectType({ description: 'Product SEO metadata' })
@Entity('ProductSEO')
@Index(['handle'], { unique: true })
export class ProductSEO {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'product_seo_id' })
  product_seo_id: number;

  @Field(() => Int)
  @Column({ type: 'int', unique: true })
  product_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  handle: string;

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

  @OneToOne(() => Product, (product) => product.seo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;
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
