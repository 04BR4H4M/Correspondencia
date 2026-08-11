// src/auth/auth.controller.ts
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { GoogleAuthGuard } from './google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly configService: ConfigService) {}

  private obtenerCorreosAutorizados(): string[] {
    const crudo = this.configService.get<string>('ALLOWED_EMAILS') || '';
    return crudo
      .split(',')
      .map((correo) => correo.trim().toLowerCase())
      .filter(Boolean);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // El guard redirige automáticamente a la pantalla de consentimiento de Google.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const usuario = req.user as { email: string; nombre: string; foto: string };
    const correosAutorizados = this.obtenerCorreosAutorizados();
    const email = (usuario?.email || '').toLowerCase();

    if (correosAutorizados.length === 0) {
      return res.redirect('/?auth_error=sin_configurar');
    }

    if (!correosAutorizados.includes(email)) {
      return res.redirect('/?auth_error=no_autorizado');
    }

    (req.session as any).user = usuario;
    res.redirect('/');
  }

  @Get('me')
  me(@Req() req: Request) {
    const usuario = (req.session as any)?.user;
    if (!usuario) {
      throw new UnauthorizedException('No hay sesión activa.');
    }
    return usuario;
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  }
}