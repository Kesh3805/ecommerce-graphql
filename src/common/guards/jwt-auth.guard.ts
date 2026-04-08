/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { APP_CONSTANTS, AUTH_ERRORS } from '../constants/constant';
import { User } from '../../modules/user/entities/user.entity';

interface TokenError {
  name: string;
  message: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext): unknown {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext<{ req: unknown }>().req;
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  handleRequest<TUser = User>(err: Error | null, user: TUser | false, info: TokenError | undefined): TUser {
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException(AUTH_ERRORS.TOKEN_EXPIRED);
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
      }
      throw err || new UnauthorizedException(AUTH_ERRORS.AUTH_REQUIRED);
    }

    const validatedUser = user as User;
    const normalizedStatus = String(validatedUser.status ?? '')
      .trim()
      .toLowerCase();
    const activeStatus = String(APP_CONSTANTS.ACTIVE_STATUS).trim().toLowerCase();

    if (normalizedStatus !== activeStatus) {
      throw new UnauthorizedException(AUTH_ERRORS.ACCOUNT_INACTIVE);
    }

    return user;
  }
}
