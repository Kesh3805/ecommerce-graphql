import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Cart, CartItem } from '../cart/entities';
import { InventoryService } from '../inventory';
import { CreateOrderInput } from './dto';
import { IdempotencyKey, Order, OrderItem } from './entities';

@Injectable()
export class OrderService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(IdempotencyKey) private readonly idempotencyRepo: Repository<IdempotencyKey>,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly cartItemRepo: Repository<CartItem>,
  ) {}

  async findOrder(orderId: number): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { order_id: orderId }, relations: { items: true } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return order;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const operation = `createOrder:${input.cart_id}`;

    const existingKey = await this.idempotencyRepo.findOne({
      where: { key: input.idempotency_key, operation },
      relations: { order: { items: true } },
    });

    if (existingKey?.order) {
      return existingKey.order;
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedCart = await manager
        .createQueryBuilder(Cart, 'cart')
        .setLock('pessimistic_write')
        .where('cart.cart_id = :cartId', { cartId: input.cart_id })
        .getOne();

      if (!lockedCart) {
        throw new NotFoundException(`Cart with ID ${input.cart_id} not found`);
      }

      if (lockedCart.status !== 'ACTIVE') {
        throw new BadRequestException(`Cart ${input.cart_id} is not active`);
      }

      const items = await manager.find(CartItem, {
        where: { cart_id: lockedCart.cart_id },
      });

      if (items.length === 0) {
        throw new BadRequestException('Cannot create order from empty cart');
      }

      const subtotal = items.reduce((sum, item) => sum + Number(item.price_snapshot) * item.quantity, 0);
      const tax = 0;
      const shipping = 0;
      const total = subtotal + tax + shipping;

      const orderNumber = `ORD-${Date.now()}-${lockedCart.cart_id}`;

      const order = await manager.save(
        Order,
        manager.create(Order, {
          order_number: orderNumber,
          store_id: lockedCart.store_id,
          customer_id: lockedCart.customer_id,
          subtotal,
          tax,
          shipping,
          total,
          currency: input.currency ?? 'USD',
        }),
      );

      await manager.save(
        OrderItem,
        items.map((item) =>
          manager.create(OrderItem, {
            order_id: order.order_id,
            variant_id: item.variant_id,
            sku_snapshot: item.sku_snapshot,
            title_snapshot: item.title_snapshot,
            price_snapshot: item.price_snapshot,
            quantity: item.quantity,
            line_total: Number(item.price_snapshot) * item.quantity,
          }),
        ),
      );

      await this.inventoryService.consumeReservationsForCart(lockedCart.cart_id);

      lockedCart.status = 'CHECKED_OUT';
      await manager.save(Cart, lockedCart);

      const responseHash = createHash('sha256').update(`${order.order_id}:${order.total}:${order.order_number}`).digest('hex');

      await manager.save(
        IdempotencyKey,
        manager.create(IdempotencyKey, {
          key: input.idempotency_key,
          operation,
          response_hash: responseHash,
          order_id: order.order_id,
        }),
      );

      return manager.findOneOrFail(Order, {
        where: { order_id: order.order_id },
        relations: { items: true },
      });
    });
  }
}
