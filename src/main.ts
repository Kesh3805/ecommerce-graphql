/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { CustomLoggerService } from './common/logger/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

const DEFAULT_PORT = 3000;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;

const defaultCorsOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:4200'];

const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : defaultCorsOrigins;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot());

  const logger = new CustomLoggerService();
  app.useLogger(logger);

  // Enable CORS
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || configuredCorsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 204,
  });

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Health check REST endpoint prefix exclusion
  app.setGlobalPrefix('api', {
    exclude: ['/', 'health'],
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(PORT);
  logger.log(`Application running on: http://localhost:${PORT}`, 'Bootstrap');
  logger.log(`GraphQL Playground: http://localhost:${PORT}/graphql`, 'Bootstrap');
}

void bootstrap();
