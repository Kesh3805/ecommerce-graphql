/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsString, IsOptional, IsBoolean, Min, IsNotEmpty } from 'class-validator';
import { AdjustmentReason } from '../../../common/enums/ecommerce.enums';

@InputType({ description: 'Input for creating a location' })
export class CreateLocationInput {
  @Field(() => Int)
  @IsInt()
  store_id: number;

  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  address?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;
}

@InputType({ description: 'Input for updating a location' })
export class UpdateLocationInput {
  @Field(() => Int)
  @IsInt()
  location_id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  address?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

@InputType({ description: 'Input for adjusting inventory at a location' })
export class AdjustInventoryInput {
  @Field(() => Int)
  @IsInt()
  inventory_item_id: number;

  @Field(() => Int)
  @IsInt()
  location_id: number;

  @Field(() => Int, { description: 'Positive or negative quantity adjustment' })
  @IsInt()
  quantity: number;

  @Field(() => AdjustmentReason)
  reason: AdjustmentReason;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType({ description: 'Input for setting inventory level at a location' })
export class SetInventoryLevelInput {
  @Field(() => Int)
  @IsInt()
  inventory_item_id: number;

  @Field(() => Int)
  @IsInt()
  location_id: number;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  available_quantity: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType({ description: 'Input for reserving inventory' })
export class ReserveInventoryInput {
  @Field(() => Int)
  @IsInt()
  inventory_item_id: number;

  @Field(() => Int)
  @IsInt()
  location_id: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity: number;
}

@InputType({ description: 'Input for transferring inventory between locations' })
export class TransferInventoryInput {
  @Field(() => Int)
  @IsInt()
  inventory_item_id: number;

  @Field(() => Int)
  @IsInt()
  from_location_id: number;

  @Field(() => Int)
  @IsInt()
  to_location_id: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
