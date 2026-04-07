import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Variant } from '../variant/entities';
import { InventoryService } from '../inventory/inventory.service';
import { AddToCartInput, CreateCartInput, UpdateCartItemInput } from './dto';
import { Cart, CartItem } from './entities';

const RESERVATION_TTL_MINUTES = 20;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

function calculateReservationExpiry(): Date {
  return new Date(Date.now() + RESERVATION_TTL_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND);
}

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

    // Use a transaction to ensure reservation and cart item update are atomic
    await this.dataSource.transaction(async (manager) => {
      // Create or release reservation based on quantity change
      if (deltaQuantity > 0) {
        await this.inventoryService.createReservationWithManager(manager, {
          inventory_item_id: variant.inventory_item_id!,
          cart_id,
          quantity: deltaQuantity,
          expires_at: calculateReservationExpiry(),
        });
      } else if (deltaQuantity < 0) {
        // Release excess reservation when quantity is reduced
        await this.inventoryService.releaseReservationsByCartItemWithManager(manager, cart_id, variant_id, Math.abs(deltaQuantity));
      }

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
    const cartItem = await this.cartItemRepo.findOne({
      where: { cart_item_id },
      relations: { variant: true },
    });
    if (!cartItem) {
      throw new NotFoundException(`Cart item with ID ${cart_item_id} not found`);
    }

    const previousQuantity = cartItem.quantity;
    const deltaQuantity = quantity - previousQuantity;

    // Use a transaction to ensure reservation changes and cart item update are atomic
    await this.dataSource.transaction(async (manager) => {
      if (deltaQuantity > 0 && cartItem.variant?.inventory_item_id) {
        // Increase quantity - create additional reservation
        await this.inventoryService.createReservationWithManager(manager, {
          inventory_item_id: cartItem.variant.inventory_item_id,
          cart_id: cartItem.cart_id,
          quantity: deltaQuantity,
          expires_at: calculateReservationExpiry(),
        });
      } else if (deltaQuantity < 0) {
        // Decrease quantity - release excess reservation
        await this.inventoryService.releaseReservationsByCartItemWithManager(manager, cartItem.cart_id, cartItem.variant_id, Math.abs(deltaQuantity));
      }

      cartItem.quantity = quantity;
      await manager.save(CartItem, cartItem);
    });

    return this.findCart(cartItem.cart_id);
  }

  async removeFromCart(cartItemId: number): Promise<Cart> {
    const cartItem = await this.cartItemRepo.findOne({ where: { cart_item_id: cartItemId } });
    if (!cartItem) {
      throw new NotFoundException(`Cart item with ID ${cartItemId} not found`);
    }

    const cartId = cartItem.cart_id;

    // Use a transaction to ensure deletion and reservation release are atomic
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CartItem, { cart_item_id: cartItemId });
      await this.inventoryService.releaseReservationsByCartItemWithManager(manager, cartItem.cart_id, cartItem.variant_id, cartItem.quantity);
    });

    return this.findCart(cartId);
  }
}
