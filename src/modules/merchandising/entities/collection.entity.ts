/**
 * Collection & Merchandising Entities
 * Extends existing catalog system with collections and product stats
 */

import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import { Product, Store } from '../../catalog/entities';

// ============================================
// ENUMS
// ============================================

export enum CollectionType {
  MANUAL = 'MANUAL',
  AUTOMATED = 'AUTOMATED',
}

export enum RuleOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  GREATER_THAN_OR_EQUAL = 'GREATER_THAN_OR_EQUAL',
  LESS_THAN_OR_EQUAL = 'LESS_THAN_OR_EQUAL',
  CONTAINS = 'CONTAINS',
  NOT_CONTAINS = 'NOT_CONTAINS',
  STARTS_WITH = 'STARTS_WITH',
  IS_SET = 'IS_SET',
  IS_NOT_SET = 'IS_NOT_SET',
}

export enum RuleValueType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
}

registerEnumType(CollectionType, { name: 'CollectionType' });
registerEnumType(RuleOperator, { name: 'RuleOperator' });
registerEnumType(RuleValueType, { name: 'RuleValueType' });

// ============================================
// COLLECTION ENTITY
// ============================================

@ObjectType({ description: 'Collection for merchandising product groups' })
@Entity('Collection')
@Index(['store_id', 'slug'], { unique: true })
@Index(['store_id', 'is_visible'])
@Index(['collection_type'])
export class Collection {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'collection_id' })
  collection_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @Field(() => CollectionType)
  @Column({ type: 'enum', enum: CollectionType, default: CollectionType.MANUAL })
  collection_type: CollectionType;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url?: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  is_visible: boolean;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  position: number;

  // SEO
  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  meta_title?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  meta_description?: string;

  // Scheduling
  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  published_at?: Date;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  unpublished_at?: Date;

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

  @OneToMany(() => CollectionProduct, (cp) => cp.collection, { cascade: true })
  product_links?: Relation<CollectionProduct[]>;

  @OneToMany(() => CollectionRule, (rule) => rule.collection, { cascade: true })
  rules?: Relation<CollectionRule[]>;

  // Computed fields
  @Field(() => Int, { nullable: true })
  product_count?: number;

  @Field(() => [Product], { nullable: true })
  products?: Product[];
}

// ============================================
// COLLECTION PRODUCT (Manual Assignment)
// ============================================

@ObjectType()
@Entity('CollectionProduct')
@Index(['collection_id', 'product_id'], { unique: true })
@Index(['collection_id', 'position'])
export class CollectionProduct {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  collection_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  product_id: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  position: number;

  @Field()
  @CreateDateColumn({ name: 'added_at' })
  added_at: Date;

  @ManyToOne(() => Collection, (collection) => collection.product_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection: Relation<Collection>;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;
}

// ============================================
// COLLECTION RULE (Automated Collections)
// ============================================

@ObjectType({ description: 'Rule for automated collection' })
@Entity('CollectionRule')
@Index(['collection_id'])
@Index(['collection_id', 'rule_group'])
export class CollectionRule {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'rule_id' })
  rule_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  collection_id: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  rule_group: number;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  field: string;

  @Field(() => RuleOperator)
  @Column({ type: 'enum', enum: RuleOperator })
  operator: RuleOperator;

  @Field()
  @Column({ type: 'text' })
  value: string;

  @Field(() => RuleValueType)
  @Column({ type: 'enum', enum: RuleValueType, default: RuleValueType.STRING })
  value_type: RuleValueType;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => Collection, (collection) => collection.rules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collection_id' })
  collection: Relation<Collection>;
}
