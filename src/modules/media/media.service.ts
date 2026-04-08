import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../catalog/entities';
import { Variant } from '../variant/entities';
import { AttachProductMediaInput } from './dto';
import { ProductMedia } from './entities';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
  ) {}

  private static readonly MEDIA_ID_FACTOR = 100000;

  private encodeMediaId(productId: number, position: number): number {
    return productId * MediaService.MEDIA_ID_FACTOR + (position + 1);
  }

  private decodeMediaId(mediaId: number): { productId: number; position: number } {
    const productId = Math.floor(mediaId / MediaService.MEDIA_ID_FACTOR);
    const position = (mediaId % MediaService.MEDIA_ID_FACTOR) - 1;
    return { productId, position };
  }

  private toMediaRows(productId: number, mediaUrls?: string[]): ProductMedia[] {
    const urls = Array.isArray(mediaUrls) ? mediaUrls : [];

    return urls.map((url, index) => ({
      media_id: this.encodeMediaId(productId, index),
      product_id: productId,
      url,
      alt_text: undefined,
      type: 'image',
      position: index,
      is_cover: index === 0,
      created_at: new Date(),
    }));
  }

  async attachProductMedia(input: AttachProductMediaInput): Promise<ProductMedia> {
    const product = await this.productRepo.findOne({ where: { product_id: input.product_id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${input.product_id} not found`);
    }

    if (input.variant_id) {
      const variant = await this.variantRepo.findOne({ where: { variant_id: input.variant_id } });
      if (!variant) {
        throw new NotFoundException(`Variant with ID ${input.variant_id} not found`);
      }
    }

    const currentMediaUrls = Array.isArray(product.media_urls) ? [...product.media_urls] : [];
    const requestedPosition = input.position ?? currentMediaUrls.length;
    const insertPosition = Math.max(0, Math.min(requestedPosition, currentMediaUrls.length));

    currentMediaUrls.splice(insertPosition, 0, input.url);

    const nextPrimaryImage =
      input.is_cover === true
        ? input.url
        : product.primary_image_url && currentMediaUrls.includes(product.primary_image_url)
          ? product.primary_image_url
          : currentMediaUrls[0];

    await this.productRepo.update(
      { product_id: input.product_id },
      {
        media_urls: currentMediaUrls,
        primary_image_url: nextPrimaryImage,
      },
    );

    return {
      media_id: this.encodeMediaId(input.product_id, insertPosition),
      product_id: input.product_id,
      url: input.url,
      alt_text: input.alt_text,
      type: input.type ?? 'image',
      position: insertPosition,
      is_cover: input.is_cover ?? false,
      created_at: new Date(),
    };
  }

  async productMedia(productId: number): Promise<ProductMedia[]> {
    const product = await this.productRepo.findOne({ where: { product_id: productId } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return this.toMediaRows(product.product_id, product.media_urls);
  }

  async deleteProductMedia(mediaId: number): Promise<boolean> {
    const { productId, position } = this.decodeMediaId(mediaId);
    const product = await this.productRepo.findOne({ where: { product_id: productId } });

    if (!product || !Array.isArray(product.media_urls) || position < 0 || position >= product.media_urls.length) {
      throw new NotFoundException(`Media with ID ${mediaId} not found`);
    }

    const nextMediaUrls = [...product.media_urls];
    const removed = nextMediaUrls.splice(position, 1);
    if (removed.length === 0) {
      throw new NotFoundException(`Media with ID ${mediaId} not found`);
    }

    const nextPrimaryImage =
      product.primary_image_url && nextMediaUrls.includes(product.primary_image_url) ? product.primary_image_url : (nextMediaUrls[0] ?? null);

    await this.productRepo.update(
      { product_id: product.product_id },
      {
        media_urls: nextMediaUrls,
        primary_image_url: nextPrimaryImage ?? undefined,
      },
    );

    return true;
  }
}
