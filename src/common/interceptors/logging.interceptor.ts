/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CustomLoggerService } from '../logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new CustomLoggerService();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();

    // Detect GraphQL vs HTTP context
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const info = gqlCtx.getInfo();
      const operation = `${info.parentType.name}.${info.fieldName}`;
      const variables = gqlCtx.getArgs();

      return next.handle().pipe(
        tap({
          next: () => {
            this.logger.logGraphQL(operation, variables, Date.now() - startTime);
          },
          error: (error: Error) => {
            this.logger.error(`[GQL] Error in ${operation} (${Date.now() - startTime}ms): ${error.message}`, error.stack, 'GraphQL');
          },
        }),
      );
    }

    // HTTP context
    const request = context.switchToHttp().getRequest<{ method: string; url: string; body: unknown; headers: Record<string, unknown> }>();
    const { method, url, body, headers } = request;

    this.logger.logRequest(method, url, body, {
      'user-agent': headers['user-agent'],
      'content-type': headers['content-type'],
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse<{ statusCode: number }>();
          this.logger.logResponse(method, url, response.statusCode, Date.now() - startTime, data);
        },
        error: (error: Error & { status?: number }) => {
          const HTTP_INTERNAL_SERVER_ERROR = 500;
          this.logger.error(
            `Request Error: ${method} ${url} - ${error.status || HTTP_INTERNAL_SERVER_ERROR} (${Date.now() - startTime}ms)`,
            error.stack,
            'HTTP',
            { error: error.message },
          );
        },
      }),
    );
  }
}
