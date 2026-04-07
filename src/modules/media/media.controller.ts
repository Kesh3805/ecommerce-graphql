import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

@Controller('media')
export class MediaController {
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          const uploadDir = join(process.cwd(), 'uploads', 'products');
          mkdirSync(uploadDir, { recursive: true });
          callback(null, uploadDir);
        },
        filename: (_request, file, callback) => {
          const extension = extname(file.originalname || '').toLowerCase();
          callback(null, `${Date.now()}-${randomUUID()}${extension}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']);
        const extension = extname(file.originalname || '').toLowerCase();
        const isImageMime = file.mimetype?.startsWith('image/');
        const isAllowedExtension = allowedExtensions.has(extension);

        if (!isImageMime && !isAllowedExtension) {
          callback(new BadRequestException('Only image uploads are allowed.'), false);
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  upload(@UploadedFile() file: { filename: string }): { url: string } {
    if (!file?.filename) {
      throw new BadRequestException('No file uploaded.');
    }

    return {
      url: `/uploads/products/${file.filename}`,
    };
  }
}
