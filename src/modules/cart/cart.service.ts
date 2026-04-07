import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Variant } from '../variant/entities';
import { InventoryService } from '../inventory/inventory.service';
import { AddToCartInput, CreateCartInput, UpdateCartItemInput } from './dto';
import { Cart, CartItem } from './entities';

const RESERVATION_TTL_MINUTES = 20;

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
  ) {}

  async createCart(input: CreateCartInput): Promise<Cart> {
    const cart = await this.cartRepo.save(this.cartRepo.create({ ...input, status: 'ACTIVE' }));
    return this.findCart(cart.cart_id);
  }

  async findCart(cartId: number): Promise<Cart> {
    const cart = await this.cartRepo.findOne({
      where: { cart_id: cartId },
      relations: { items: true },
    });

    if (!cart) {
      throw new NotFoundException(`Cart with ID ${cartId} not found`);
    }

    return cart;
  }

  async addToCart(input: AddToCartInput): Promise<Cart> {
    const { cart_id, variant_id, quantity } = input;
    const cart = await this.findCart(cart_id);

    const variant = await this.variantRepo.findOne({
      where: { variant_id },
      relations: { inventory_item: true },
    });
    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variant_id} not found`);
    }

    if (!variant.inventory_item_id) {
      throw new BadRequestException('Variant has no inventory item configured');
    }

    if (variant.price === undefined || variant.price === null) {
      throw new BadRequestException('Variant cannot be added to cart without a price');
    }

    const existing = await this.cartItemRepo.findOne({ where: { cart_id, variant_id } });
    const previousQuantity = existing?.quantity ?? 0;
    const deltaQuantity = quantity - previousQuantity;

    if (deltaQuantity > 0) {
      await this.inventoryService.createReservation({
        inventory_item_id: variant.inventory_item_id,
        cart_id,
        quantity: deltaQuantity,
        expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000),
      });
    }

    await this.dataSource.transaction(async (manager) => {
      if (existing) {
        existing.quantity = quantity;
        existing.price_snapshot = Number(variant.price);
        existing.sku_snapshot = variant.sku ?? undefined;
        existing.title_snapshot = [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(' / ') || 'Default';
        await manager.save(CartItem, existing);
      } else {
        await manager.save(
          CartItem,
          manager.create(CartItem, {
            cart_id,
            variant_id,
            quantity,
            price_snapshot: Number(variant.price),
            sku_snapshot: variant.sku ?? undefined,
            title_snapshot: [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(' / ') || 'Default',
          }),
        );
      }
    });

    return this.findCart(cart.cart_id);
  }

  async updateCartItem(input: UpdateCartItemInput): Promise<Cart> {
    const { cart_item_id, quantity } = input;
    const cartItem = await this.cartItemRepo.findOne({ where: { cart_item_id } });
    if (!cartItem) {
      throw new NotFoundException(`Cart item with ID ${cart_item_id} not found`);
    }

    cartItem.quantity = quantity;
    await this.cartItemRepo.save(cartItem);
    return this.findCart(cartItem.cart_id);
  }

  async removeFromCart(cartItemId: number): Promise<Cart> {
    const cartItem = await this.cartItemRepo.findOne({ where: { cart_item_id: cartItemId } });
    if (!cartItem) {
      throw new NotFoundException(`Cart item with ID ${cartItemId} not found`);
    }

    await this.cartItemRepo.delete({ cart_item_id: cartItemId });
    await this.inventoryService.releaseReservationsByCartItem(cartItem.cart_id, cartItem.variant_id, cartItem.quantity);
    return this.findCart(cartItem.cart_id);
  }
}
