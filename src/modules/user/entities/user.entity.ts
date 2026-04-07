/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  STORE_OWNER = 'STORE_OWNER',
}

registerEnumType(UserRole, {
  name: 'UserRole',
  description: 'The role of the user in the system',
});

@ObjectType()
@Entity('users')
export class User {
  @Field(() => Int)
  @PrimaryGeneratedColumn({ name: 'user_id' })
  id: number;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Field()
  @Column({ type: 'varchar', length: 50, default: UserRole.STORE_OWNER })
  role: string;

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}


