import { Args, Query, Resolver } from '@nestjs/graphql';
import { Product } from '../catalog/entities';
import { ProductSearchInput } from './dto';
import { SearchService } from './search.service';

@Resolver()
export class SearchResolver {
  constructor(private readonly searchService: SearchService) {}

  @Query(() => [Product])
  async searchProducts(@Args('input') input: ProductSearchInput): Promise<Product[]> {
    return this.searchService.searchProducts(input);
  }
}
