/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { UseGuards } from '@nestjs/common';
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VariantService } from './variant.service';
import { Variant } from './entities';
import { GenerateVariantsInput, UpdateVariantInput, CreateVariantInput, BulkUpdateVariantPricesInput } from './dto';
import { GenerateVariantsResponse, BulkUpdateResponse } from './dto/variant.response';

@Resolver(() => Variant)
export class VariantResolver {
  constructor(private readonly variantService: VariantService) {}

  @Query(() => [Variant], { description: 'Get all variants for a product' })
  async variants(@Args('productId', { type: () => Int }) productId: number): Promise<Variant[]> {
    return this.variantService.findByProductId(productId);
  }

  @Query(() => [Variant], { description: 'Get product variants for storefront' })
  async productVariants(@Args('productId', { type: () => Int }) productId: number): Promise<Variant[]> {
    return this.variantService.findByProductId(productId);
  }

  @Query(() => Boolean, { description: 'Check if a variant has available stock' })
  async variantAvailability(@Args('variantId', { type: () => Int }) variantId: number): Promise<boolean> {
    return this.variantService.variantAvailability(variantId);
  }

  @Query(() => Variant, { description: 'Get a single variant by ID' })
  async variant(@Args('id', { type: () => Int }) id: number): Promise<Variant> {
    return this.variantService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Variant, { description: 'Create a single variant manually' })
  async createVariant(@Args('input') input: CreateVariantInput): Promise<Variant> {
    return this.variantService.create(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Variant, { description: 'Update a variant' })
  async updateVariant(@Args('input') input: UpdateVariantInput): Promise<Variant> {
    return this.variantService.update(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: 'Delete a variant' })
  async deleteVariant(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
    return this.variantService.delete(id);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => GenerateVariantsResponse, {
    description: 'Generate variants from cartesian product of product options',
  })
  async generateVariants(@Args('input') input: GenerateVariantsInput): Promise<GenerateVariantsResponse> {
    return this.variantService.generateVariants(input);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => BulkUpdateResponse, { description: 'Bulk update variant prices' })
  async bulkUpdateVariantPrices(@Args('input') input: BulkUpdateVariantPricesInput): Promise<BulkUpdateResponse> {
    return this.variantService.bulkUpdatePrices(input);
  }
}
