import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../catalog/entities';
import { SearchResolver } from './search.resolver';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  providers: [SearchService, SearchResolver],
  exports: [SearchService],
})
export class SearchModule {}
