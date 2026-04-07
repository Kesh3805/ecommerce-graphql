import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CartService } from './cart.service';
import { AddToCartInput, CreateCartInput, UpdateCartItemInput } from './dto';
import { Cart } from './entities';

@Resolver(() => Cart)
export class CartResolver {
  constructor(private readonly cartService: CartService) {}

  @Query(() => Cart)
  async cart(@Args('id', { type: () => Int }) id: number): Promise<Cart> {
    return this.cartService.findCart(id);
  }

  @Mutation(() => Cart)
  async createCart(@Args('input') input: CreateCartInput): Promise<Cart> {
    return this.cartService.createCart(input);
  }

  @Mutation(() => Cart)
  async addToCart(@Args('input') input: AddToCartInput): Promise<Cart> {
    return this.cartService.addToCart(input);
  }

  @Mutation(() => Cart)
  async updateCartItem(@Args('input') input: UpdateCartItemInput): Promise<Cart> {
    return this.cartService.updateCartItem(input);
  }

  @Mutation(() => Cart)
  async removeFromCart(@Args('cartItemId', { type: () => Int }) cartItemId: number): Promise<Cart> {
    return this.cartService.removeFromCart(cartItemId);
  }
}
