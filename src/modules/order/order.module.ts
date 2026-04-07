import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart, CartItem } from '../cart/entities';
import { InventoryModule } from '../inventory';
import { IdempotencyKey, Order, OrderItem } from './entities';
import { OrderResolver } from './order.resolver';
import { OrderService } from './order.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, IdempotencyKey, Cart, CartItem]), InventoryModule],
  providers: [OrderService, OrderResolver],
  exports: [OrderService],
})
export class OrderModule {}
