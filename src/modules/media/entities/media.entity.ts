import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from '../../catalog/entities';
import { Variant } from '../../variant/entities';

@ObjectType()
@Entity('ProductMedia')
@Index(['product_id', 'position'])
export class ProductMedia {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'media_id' })
  media_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Field()
  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  alt_text?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  type?: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  position: number;

  @Field()
  @Column({ type: 'boolean', default: false })
  is_cover: boolean;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}

@ObjectType()
@Entity('VariantMedia')
@Index(['variant_id', 'media_id'], { unique: true })
export class VariantMedia {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'variant_media_id' })
  variant_media_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  variant_id: number;

  @ManyToOne(() => Variant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: Variant;

  @Field(() => Int)
  @Column({ type: 'int' })
  media_id: number;

  @ManyToOne(() => ProductMedia, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'media_id' })
  media: ProductMedia;
}
