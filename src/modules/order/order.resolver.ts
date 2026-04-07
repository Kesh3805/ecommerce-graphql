import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateOrderInput } from './dto';
import { Order } from './entities';
import { OrderService } from './order.service';

@Resolver(() => Order)
export class OrderResolver {
  constructor(private readonly orderService: OrderService) {}

  @UseGuards(JwtAuthGuard)
  @Query(() => Order)
  async order(@Args('id', { type: () => Int }) id: number): Promise<Order> {
    return this.orderService.findOrder(id);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Order)
  async createOrder(@Args('input') input: CreateOrderInput): Promise<Order> {
    return this.orderService.createOrder(input);
  }
}
