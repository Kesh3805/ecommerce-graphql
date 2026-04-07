/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import { Location, InventoryLevelEntity, InventoryItemEntity, InventoryAdjustment } from './entities';
import { CreateLocationInput, UpdateLocationInput, AdjustInventoryInput, SetInventoryLevelInput, ReserveInventoryInput, TransferInventoryInput } from './dto';
import { AdjustInventoryResponse, TransferInventoryResponse } from './dto/inventory.response';

@Resolver()
export class InventoryResolver {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==================== LOCATION QUERIES/MUTATIONS ====================

  @Query(() => [Location], { description: 'Get all locations for a store' })
  async locations(@Args('storeId', { type: () => Int }) storeId: number): Promise<Location[]> {
    return this.inventoryService.findLocationsByStore(storeId);
  }

  @Query(() => Location, { description: 'Get a single location by ID' })
  async location(@Args('id', { type: () => Int }) id: number): Promise<Location> {
    return this.inventoryService.findLocation(id);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Location, { description: 'Create a new location' })
  async createLocation(@Args('input') input: CreateLocationInput): Promise<Location> {
    return this.inventoryService.createLocation(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Location, { description: 'Update a location' })
  async updateLocation(@Args('input') input: UpdateLocationInput): Promise<Location> {
    return this.inventoryService.updateLocation(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a location' })
  async deleteLocation(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
    return this.inventoryService.deleteLocation(id);
  }

  // ==================== INVENTORY QUERIES ====================

  @Query(() => InventoryItemEntity, { description: 'Get inventory item with levels' })
  async inventoryItem(@Args('id', { type: () => Int }) id: number): Promise<InventoryItemEntity> {
    return this.inventoryService.findInventoryItem(id);
  }

  @Query(() => [InventoryLevelEntity], { description: 'Get inventory levels for a variant' })
  async inventoryLevels(@Args('variantId', { type: () => Int }) variantId: number): Promise<InventoryLevelEntity[]> {
    return this.inventoryService.findInventoryLevelsByVariant(variantId);
  }

  @Query(() => [InventoryAdjustment], { description: 'Get adjustment history for an inventory level' })
  async inventoryAdjustments(@Args('inventoryLevelId', { type: () => Int }) inventoryLevelId: number): Promise<InventoryAdjustment[]> {
    return this.inventoryService.getAdjustmentHistory(inventoryLevelId);
  }

  // ==================== INVENTORY MUTATIONS ====================

  @UseGuards(JwtAuthGuard)
  @Mutation(() => AdjustInventoryResponse, { description: 'Adjust inventory quantity' })
  async adjustInventory(@Args('input') input: AdjustInventoryInput): Promise<AdjustInventoryResponse> {
    return this.inventoryService.adjustInventory(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => AdjustInventoryResponse, { description: 'Set inventory level to specific quantity' })
  async setInventoryLevel(@Args('input') input: SetInventoryLevelInput): Promise<AdjustInventoryResponse> {
    return this.inventoryService.setInventoryLevel(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => AdjustInventoryResponse, { description: 'Set inventory (alias for setInventoryLevel)' })
  async setInventory(@Args('input') input: SetInventoryLevelInput): Promise<AdjustInventoryResponse> {
    return this.inventoryService.setInventoryLevel(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => InventoryLevelEntity, { description: 'Reserve inventory for an order' })
  async reserveInventory(@Args('input') input: ReserveInventoryInput): Promise<InventoryLevelEntity> {
    return this.inventoryService.reserveInventory(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => InventoryLevelEntity, { description: 'Release reserved inventory' })
  async unreserveInventory(@Args('input') input: ReserveInventoryInput): Promise<InventoryLevelEntity> {
    return this.inventoryService.unreserveInventory(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => TransferInventoryResponse, { description: 'Transfer inventory between locations' })
  async transferInventory(@Args('input') input: TransferInventoryInput): Promise<TransferInventoryResponse> {
    return this.inventoryService.transferInventory(input);
  }
}
