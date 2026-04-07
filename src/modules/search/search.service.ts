import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product } from '../catalog/entities';
import { ProductSearchInput } from './dto';

@Injectable()
export class SearchService {
  constructor(@InjectRepository(Product) private readonly productRepo: Repository<Product>) {}

  async searchProducts(input: ProductSearchInput): Promise<Product[]> {
    const limit = input.limit ?? 20;
    return this.productRepo.find({
      where: [
        { store_id: input.store_id, title: ILike(`%${input.query}%`) },
        { store_id: input.store_id, description: ILike(`%${input.query}%`) },
        { store_id: input.store_id, brand: ILike(`%${input.query}%`) },
      ],
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async indexProductEvent(_eventName: string, _payload: unknown): Promise<void> {
    return;
  }
}
