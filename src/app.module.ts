/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { CatalogModule } from './modules/catalog';
import { VariantModule } from './modules/variant';
import { InventoryModule } from './modules/inventory';
import { CartModule } from './modules/cart';
import { OrderModule } from './modules/order';
import { MediaModule } from './modules/media';
import { SearchModule } from './modules/search';
import { MerchandisingModule } from './modules/merchandising/merchandising.module';
import { HealthController } from './health.controller';
import { DatabasePerformanceService } from './common/database/database-performance.service';

export class AppModule {
  static forRoot(): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),

        GraphQLModule.forRootAsync<ApolloDriverConfig>({
          driver: ApolloDriver,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
            sortSchema: true,
            playground: configService.get<string>('GRAPHQL_PLAYGROUND') === 'true',
            introspection: configService.get<string>('GRAPHQL_INTROSPECTION') === 'true',
            context: ({ req }: { req: Express.Request }) => ({ req }),
            formatError: (error) => ({
              message: error.message,
              code: error.extensions?.code,
              path: error.path,
            }),
          }),
        }),

        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const PG_DEFAULT_PORT = 5432;
            const databaseUrl = configService.get<string>('DATABASE_URL');
            const logSqlQueries = configService.get<string>('DB_LOG_QUERIES', 'false') === 'true';

            if (databaseUrl) {
              return {
                type: 'postgres' as const,
                url: databaseUrl,
                ssl: {
                  rejectUnauthorized: false,
                },
                extra: {
                  max: configService.get<number>('DB_POOL_MAX', 20),
                  min: configService.get<number>('DB_POOL_MIN', 2),
                  idleTimeoutMillis: configService.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
                  connectionTimeoutMillis: configService.get<number>('DB_CONNECT_TIMEOUT_MS', 15000),
                  keepAlive: true,
                },
                autoLoadEntities: true,
                // Keep synchronization disabled in app startup to avoid TypeORM schema sync concurrency warnings.
                synchronize: false,
                logging: logSqlQueries ? ['query', 'error'] : ['error'],
                logger: 'advanced-console' as const,
              };
            }

            return {
              type: 'postgres' as const,
              host: configService.get<string>('DB_HOST', 'localhost'),
              port: configService.get<number>('DB_PORT', PG_DEFAULT_PORT),
              username: configService.get<string>('DB_USER', 'postgres'),
              password: configService.get<string>('DB_PASS', ''),
              database: configService.get<string>('DB_NAME', 'gk_poc_graphql'),
              extra: {
                max: configService.get<number>('DB_POOL_MAX', 20),
                min: configService.get<number>('DB_POOL_MIN', 2),
                idleTimeoutMillis: configService.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
                connectionTimeoutMillis: configService.get<number>('DB_CONNECT_TIMEOUT_MS', 15000),
                keepAlive: true,
              },
              autoLoadEntities: true,
              // Keep synchronization disabled in app startup to avoid TypeORM schema sync concurrency warnings.
              synchronize: false,
              logging: logSqlQueries ? ['query', 'error'] : ['error'],
              logger: 'advanced-console' as const,
            };
          },
        }),

        LoggerModule,
        AuthModule,
        UserModule,
        CatalogModule,
        VariantModule,
        InventoryModule,
        CartModule,
        OrderModule,
        MediaModule,
        SearchModule,
        MerchandisingModule,
      ],
      providers: [DatabasePerformanceService],
    };
  }
}
