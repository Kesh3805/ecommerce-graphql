import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
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
import { FulfillmentStatus, OrderStatus, PaymentStatus } from '../../../common/enums/ecommerce.enums';

@ObjectType()
@Entity('Order')
@Index(['store_id', 'created_at'])
@Index(['status'])
export class Order {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'order_id' })
  order_id: number;

  @Field()
  @Column({ type: 'varchar', length: 60, unique: true })
  order_number: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  store_id: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  customer_id?: string | null;

  @Field(() => OrderStatus)
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status: OrderStatus;

  @Field(() => PaymentStatus)
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  payment_status: PaymentStatus;

  @Field(() => FulfillmentStatus)
  @Column({ type: 'enum', enum: FulfillmentStatus, default: FulfillmentStatus.UNFULFILLED })
  fulfillment_status: FulfillmentStatus;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  tax: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  shipping: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total: number;

  @Field()
  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Field(() => [OrderItem], { nullable: true })
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items?: OrderItem[];

  @OneToOne(() => IdempotencyKey, (key) => key.order)
  idempotency?: Relation<IdempotencyKey>;
}

@ObjectType()
@Entity('OrderItem')
@Index(['order_id'])
export class OrderItem {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'order_item_id' })
  order_item_id: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  order_id: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @Field(() => Int)
  @Column({ type: 'int' })
  variant_id: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  sku_snapshot?: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  title_snapshot?: string;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price_snapshot: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  quantity: number;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  line_total: number;
}

@ObjectType()
@Entity('IdempotencyKey')
@Index(['key'], { unique: true })
@Index(['operation'])
export class IdempotencyKey {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'idempotency_id' })
  idempotency_id: number;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  key: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  operation: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  response_hash?: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true, unique: true })
  order_id?: number;

  @OneToOne(() => Order, (order) => order.idempotency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order?: Relation<Order>;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
