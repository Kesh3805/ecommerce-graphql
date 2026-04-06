/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { GetUsersInput } from './dto/get-users.input';
import { PaginatedUsersResponse } from './dto/paginated-users.type';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Resolver(() => User)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Query(() => PaginatedUsersResponse, { description: 'Get paginated list of users (requires auth)' })
  @UseGuards(JwtAuthGuard)
  async users(@Args('input', { nullable: true }) input: GetUsersInput): Promise<PaginatedUsersResponse> {
    return this.userService.findAll(input || {});
  }

  @Query(() => User, { description: 'Get a single user by ID (requires auth)' })
  @UseGuards(JwtAuthGuard)
  async user(@Args('id', { type: () => Int }) id: number): Promise<User> {
    return this.userService.findOne(id);
  }

  @Query(() => User, { description: 'Get currently authenticated user profile' })
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: User): Promise<User> {
    return this.userService.findOne(currentUser.id);
  }

  @Mutation(() => User, { description: 'Create a new user' })
  async createUser(@Args('input') input: CreateUserInput): Promise<User> {
    return this.userService.create(input);
  }

  @Mutation(() => User, { description: 'Update an existing user (requires auth)' })
  @UseGuards(JwtAuthGuard)
  async updateUser(@Args('input') input: UpdateUserInput): Promise<User> {
    return this.userService.update(input);
  }

  @Mutation(() => Boolean, { description: 'Delete a user by ID (requires auth)' })
  @UseGuards(JwtAuthGuard)
  async removeUser(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
    return this.userService.remove(id);
  }
}
