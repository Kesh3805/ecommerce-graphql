import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Variant } from '../../variant/entities';

@ObjectType()
@Entity('carts')
@Index(['store_id', 'customer_id'])
@Index(['status'])
export class Cart {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'cart_id' })
  cart_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  customer_id?: string | null;

  @Field()
  @Column({ type: 'varchar', length: 40, default: 'ACTIVE' })
  status: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Field(() => [CartItem], { nullable: true })
  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true })
  items?: CartItem[];

  @Field(() => [CartSession], { nullable: true })
  @OneToMany(() => CartSession, (session) => session.cart, { cascade: true })
  sessions?: CartSession[];
}

@ObjectType()
@Entity('cart_items')
@Index(['cart_id', 'variant_id'], { unique: true })
export class CartItem {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'cart_item_id' })
  cart_item_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  cart_id: number;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Field(() => Int)
  @Column({ type: 'int' })
  variant_id: number;

  @ManyToOne(() => Variant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: Variant;

  @Field(() => Int)
  @Column({ type: 'int' })
  quantity: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price_snapshot: number;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  sku_snapshot?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  title_snapshot?: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

@ObjectType()
@Entity('cart_sessions')
@Index(['session_key'], { unique: true })
@Index(['expires_at'])
export class CartSession {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'cart_session_id' })
  cart_session_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  cart_id: number;

  @ManyToOne(() => Cart, (cart) => cart.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  session_key: string;

  @Field()
  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
