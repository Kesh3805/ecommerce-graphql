import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../catalog/entities';
import { Variant } from '../variant/entities';
import { AttachProductMediaInput } from './dto';
import { ProductMedia, VariantMedia } from './entities';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(ProductMedia) private readonly productMediaRepo: Repository<ProductMedia>,
    @InjectRepository(VariantMedia) private readonly variantMediaRepo: Repository<VariantMedia>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
  ) {}

  async attachProductMedia(input: AttachProductMediaInput): Promise<ProductMedia> {
    const product = await this.productRepo.findOne({ where: { product_id: input.product_id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${input.product_id} not found`);
    }

    const media = await this.productMediaRepo.save(
      this.productMediaRepo.create({
        product_id: input.product_id,
        url: input.url,
        alt_text: input.alt_text,
        type: input.type,
        position: input.position ?? 0,
        is_cover: input.is_cover ?? false,
      }),
    );

    if (input.variant_id) {
      const variant = await this.variantRepo.findOne({ where: { variant_id: input.variant_id } });
      if (!variant) {
        throw new NotFoundException(`Variant with ID ${input.variant_id} not found`);
      }

      await this.variantMediaRepo.save(
        this.variantMediaRepo.create({
          variant_id: input.variant_id,
          media_id: media.media_id,
        }),
      );
    }

    return media;
  }

  async productMedia(productId: number): Promise<ProductMedia[]> {
    return this.productMediaRepo.find({ where: { product_id: productId }, order: { position: 'ASC' } });
  }
}
