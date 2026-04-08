import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import { InventoryPolicy } from '../../../common/enums/ecommerce.enums';
import { Product } from '../../catalog/entities/product.entity';
import { InventoryItem } from '../../inventory/entities/inventory.entity';

@ObjectType({ description: 'Product variant entity' })
@Entity('Variant')
@Index(['product_id'])
@Index(['sku'], { unique: true, where: 'sku IS NOT NULL' })
@Index(['product_id', 'option1_value', 'option2_value', 'option3_value'], { unique: true })
export class Variant {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'variant_id' })
  variant_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  product_id: number;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  option1_value?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  option2_value?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  option3_value?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  sku?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  barcode?: string;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  price?: number;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  compare_at_price?: number;

  @Field(() => [String], { nullable: true })
  @Column({ type: 'text', array: true, nullable: true })
  media_urls?: string[];

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cost_price?: number;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  weight?: number;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true, default: 'kg' })
  weight_unit?: string;

  @Field(() => InventoryPolicy)
  @Column({ type: 'enum', enum: InventoryPolicy, default: InventoryPolicy.DENY })
  inventory_policy: InventoryPolicy;

  @Field()
  @Column({ type: 'boolean', default: false })
  is_default: boolean;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true, unique: true })
  inventory_item_id?: number;

  @Field(() => InventoryItem, { nullable: true })
  @OneToOne(() => InventoryItem, (item) => item.variant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventory_item?: Relation<InventoryItem>;

  @Field(() => String, { description: 'Combined option values as display title', nullable: true })
  title?: string;
}
