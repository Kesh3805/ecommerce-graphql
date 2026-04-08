import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../catalog/entities';
import { Variant } from '../variant/entities';
import { MediaController } from './media.controller';
import { MediaResolver } from './media.resolver';
import { MediaService } from './media.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Variant])],
  controllers: [MediaController],
  providers: [MediaService, MediaResolver],
  exports: [MediaService],
})
export class MediaModule {}
