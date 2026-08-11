// src/auth/session-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.session?.user) {
      return true;
    }
    throw new UnauthorizedException(
      'Debes iniciar sesión con la cuenta de Google autorizada para continuar.',
    );
  }
}