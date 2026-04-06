/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { ConfigService } from '@nestjs/config';

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

        PrismaModule,
        LoggerModule,
        AuthModule,
        UserModule,
      ],
    };
  }
}
