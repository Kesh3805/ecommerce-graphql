/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserResolver } from './user.resolver';
import { UserRepository } from './repository/user.repository';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, UserResolver, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
