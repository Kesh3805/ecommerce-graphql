/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { APP_CONSTANTS, USER_ERRORS } from '../../../common/constants/constant';
import { PaginatedResponse } from '../../../common/interfaces/paginated-response.interface';

export interface GetUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: string;
  status?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: string;
  passwordHash?: string;
}

@Injectable()
export class UserRepository {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<(User & { password: string }) | null> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) return null;
    return { ...user, password: user.passwordHash };
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async create(data: CreateUserData): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException(USER_ERRORS.EMAIL_ALREADY_EXISTS);
    }

    return this.userRepo.save(
      this.userRepo.create({
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role ?? 'STORE_OWNER',
        status: data.status ?? APP_CONSTANTS.ACTIVE_STATUS,
      }),
    );
  }

  async update(id: number, data: UpdateUserData): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(USER_ERRORS.NOT_FOUND);

    await this.userRepo.update(id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
    });

    return (await this.findById(id)) as User;
  }

  async delete(id: number): Promise<void> {
    const existing = await this.userRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(USER_ERRORS.NOT_FOUND);
    await this.userRepo.delete(id);
  }

  async findAll(options: GetUsersOptions): Promise<PaginatedResponse<User>> {
    const DEFAULT_PAGE = 1;
    const DEFAULT_LIMIT = 10;
    const page = options.page ?? DEFAULT_PAGE;
    const limit = options.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: any = { status: APP_CONSTANTS.ACTIVE_STATUS };
    if (options.search) {
      where.OR = [
        { name: ILike(`%${options.search}%`) },
        { email: ILike(`%${options.search}%`) },
      ];
    }

    const [rows, total] = await this.userRepo.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }
}

