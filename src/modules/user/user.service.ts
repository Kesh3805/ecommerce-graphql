/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository } from './repository/user.repository';
import { User } from './entities/user.entity';
import { CustomLoggerService } from '../../common/logger/logger.service';
import { APP_CONSTANTS, USER_ERRORS } from '../../common/constants/constant';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { GetUsersInput } from './dto/get-users.input';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly logger: CustomLoggerService,
  ) {
    this.logger.setContext('UserService');
  }

  async findAll(input: GetUsersInput): Promise<PaginatedResponse<User>> {
    return this.userRepository.findAll(input);
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(USER_ERRORS.NOT_FOUND);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async create(input: CreateUserInput): Promise<User> {
    const hashedPassword = await bcrypt.hash(input.password, APP_CONSTANTS.SALT_ROUNDS);

    const user = await this.userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: hashedPassword,
      role: input.role ?? 'STORE_OWNER',
      status: APP_CONSTANTS.ACTIVE_STATUS,
    });

    this.logger.log(`User created: ${user.email}`, 'UserService');
    return user;
  }

  async update(input: UpdateUserInput): Promise<User> {
    const { id, password, ...rest } = input;

    const updateData: { name?: string; email?: string; role?: string; passwordHash?: string } = { ...rest };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, APP_CONSTANTS.SALT_ROUNDS);
    }

    const user = await this.userRepository.update(id, updateData);
    this.logger.log(`User updated: ${user.id}`, 'UserService');
    return user;
  }

  async remove(id: number): Promise<boolean> {
    await this.userRepository.delete(id);
    this.logger.log(`User deleted: ${id}`, 'UserService');
    return true;
  }
}
