/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  private toUser(p: any): User {
    const u = new User();
    u.id = p.user_id;
    u.name = p.name;
    u.email = p.email;
    u.role = p.role;
    u.status = p.status;
    u.createdAt = p.created_at;
    u.updatedAt = p.updated_at;
    return u;
  }

  async findByEmail(email: string): Promise<User | null> {
    const p = await this.prisma.user.findUnique({ where: { email } });
    return p ? this.toUser(p) : null;
  }

  async findByEmailWithPassword(email: string): Promise<(User & { password: string }) | null> {
    const p = await this.prisma.user.findUnique({ where: { email } });
    if (!p) return null;
    return { ...this.toUser(p), password: p.password_hash };
  }

  async findById(id: number): Promise<User | null> {
    const p = await this.prisma.user.findUnique({ where: { user_id: id } });
    return p ? this.toUser(p) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException(USER_ERRORS.EMAIL_ALREADY_EXISTS);
    }
    const p = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password_hash: data.passwordHash,
        role: data.role ?? 'STORE_OWNER',
        status: data.status ?? APP_CONSTANTS.ACTIVE_STATUS,
      },
    });
    return this.toUser(p);
  }

  async update(id: number, data: UpdateUserData): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { user_id: id } });
    if (!existing) throw new NotFoundException(USER_ERRORS.NOT_FOUND);

    const update: any = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.email !== undefined) update.email = data.email;
    if (data.role !== undefined) update.role = data.role;
    if (data.passwordHash !== undefined) update.password_hash = data.passwordHash;

    const p = await this.prisma.user.update({ where: { user_id: id }, data: update });
    return this.toUser(p);
  }

  async delete(id: number): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { user_id: id } });
    if (!existing) throw new NotFoundException(USER_ERRORS.NOT_FOUND);
    await this.prisma.user.delete({ where: { user_id: id } });
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
        { name: { contains: options.search, mode: 'insensitive' } },
        { email: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map((p) => this.toUser(p)),
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

