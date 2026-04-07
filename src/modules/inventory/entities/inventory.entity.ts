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
import { AdjustmentReason } from '../../../common/enums/ecommerce.enums';
import { Store } from '../../catalog/entities/product.entity';
import { Variant } from '../../variant/entities/variant.entity';

@ObjectType({ description: 'Location entity for multi-location inventory' })
@Entity('InventoryLocation')
@Index(['store_id', 'name'], { unique: true })
export class Location {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'location_id' })
  location_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  city?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  country?: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'store_id' })
  store: Relation<Store>;

  @OneToMany(() => InventoryLevelEntity, (level) => level.location)
  levels: Relation<InventoryLevelEntity[]>;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

@ObjectType({ description: 'Inventory item with levels across locations' })
@Entity('InventoryItem')
@Index(['sku'], { unique: true, where: 'sku IS NOT NULL' })
export class InventoryItem {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'inventory_item_id' })
  inventory_item_id: number;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  sku?: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  tracked: boolean;

  @Field(() => [InventoryLevelEntity], { nullable: true })
  @OneToMany(() => InventoryLevelEntity, (level) => level.inventory_item, { cascade: true })
  levels: Relation<InventoryLevelEntity[]>;

  @OneToOne(() => Variant, (variant) => variant.inventory_item)
  variant?: Relation<Variant>;

  @Field(() => Int, { description: 'Total available across all locations', nullable: true })
  total_available?: number;

  @Field(() => Int, { description: 'Total reserved across all locations', nullable: true })
  total_reserved?: number;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

@ObjectType({ description: 'Inventory level at a specific location' })
@Entity('InventoryLevel')
@Index(['inventory_item_id', 'location_id'], { unique: true })
export class InventoryLevelEntity {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'inventory_level_id' })
  inventory_level_id: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  available_quantity: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  reserved_quantity: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  inventory_item_id: number;

  @ManyToOne(() => InventoryItem, (item) => item.levels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventory_item: Relation<InventoryItem>;

  @Field(() => Int)
  @Column({ type: 'int' })
  location_id: number;

  @Field(() => Location, { nullable: true })
  @ManyToOne(() => Location, (location) => location.levels, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id' })
  location?: Relation<Location>;

  @OneToMany(() => InventoryAdjustment, (adjustment) => adjustment.level)
  adjustments: Relation<InventoryAdjustment[]>;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

@ObjectType({ description: 'Inventory adjustment log entry' })
@Entity('InventoryAdjustment')
@Index(['inventory_level_id', 'created_at'])
export class InventoryAdjustment {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'adjustment_id' })
  adjustment_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  quantity: number;

  @Field(() => AdjustmentReason)
  @Column({ type: 'enum', enum: AdjustmentReason })
  reason: AdjustmentReason;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  inventory_level_id: number;

  @ManyToOne(() => InventoryLevelEntity, (level) => level.adjustments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_level_id' })
  level: Relation<InventoryLevelEntity>;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}

@ObjectType({ description: 'Inventory reservation for cart/checkout flow' })
@Entity('InventoryReservation')
@Index(['inventory_item_id', 'cart_id'])
@Index(['expires_at'])
export class InventoryReservation {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'reservation_id' })
  reservation_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  inventory_item_id: number;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventory_item: Relation<InventoryItem>;

  @Field(() => Int)
  @Column({ type: 'int' })
  cart_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  quantity: number;

  @Field()
  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}

export { InventoryItem as InventoryItemEntity };
