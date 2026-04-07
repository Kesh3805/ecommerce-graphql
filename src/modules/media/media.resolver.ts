import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AttachProductMediaInput } from './dto';
import { ProductMedia } from './entities';
import { MediaService } from './media.service';

@Resolver(() => ProductMedia)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard)
  @Mutation(() => ProductMedia)
  async attachProductMedia(@Args('input') input: AttachProductMediaInput): Promise<ProductMedia> {
    return this.mediaService.attachProductMedia(input);
  }

  @Query(() => [ProductMedia])
  async productMedia(@Args('productId', { type: () => Int }) productId: number): Promise<ProductMedia[]> {
    return this.mediaService.productMedia(productId);
  }
}
