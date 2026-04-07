import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory';
import { Variant } from '../variant/entities';
import { CartResolver } from './cart.resolver';
import { CartService } from './cart.service';
import { Cart, CartItem, CartSession } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem, CartSession, Variant]), InventoryModule],
  providers: [CartService, CartResolver],
  exports: [CartService],
})
export class CartModule {}
