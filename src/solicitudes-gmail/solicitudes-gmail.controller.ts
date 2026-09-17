// src/solicitudes-gmail/solicitudes-gmail.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SolicitudesGmailService } from './solicitudes-gmail.service';
import { EstadoSugerida } from './entities/solicitud-sugerida.entity';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ConfiguracionService } from '../../configuracion/configuracion.service';

@Controller('gmail')
export class SolicitudesGmailController {
  constructor(
    private readonly gmailService: SolicitudesGmailService,
    private readonly configuracionService: ConfiguracionService,
  ) {}

  @Get('conectar')
  @UseGuards(SessionAuthGuard)
  conectar(@Res() res: Response) {
    const url = this.gmailService.generarUrlConexion();
    res.redirect(url);
  }

  // Nota: este callback lo llama Google directamente, no el navegador del usuario logueado
  // en nuestra sesión — por eso NO lleva SessionAuthGuard. La seguridad la da el propio
  // flujo de OAuth (el "code" que entrega Google es de un solo uso y de corta duración).
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    try {
      if (!code) throw new BadRequestException('Falta el código de autorización.');
      await this.gmailService.procesarCallback(code);
      res.redirect('/?gmail=conectado#descargas');
    } catch (error) {
      console.error('Error conectando Gmail:', error);
      const mensaje = error instanceof BadRequestException ? error.message : 'No se pudo conectar Gmail.';
      res.redirect(`/?gmail_error=${encodeURIComponent(mensaje)}`);
    }
  }

  @Get('estado')
  @UseGuards(SessionAuthGuard)
  async estado() {
    const estado = await this.configuracionService.obtenerEstadoGmail();
    const pendientes = await this.gmailService.contarPendientes();
    return { ...estado, pendientes };
  }

  @Post('desconectar')
  @UseGuards(SessionAuthGuard)
  async desconectar() {
    await this.gmailService.desconectar();
    return { ok: true };
  }

  @Get('escanear')
  @UseGuards(SessionAuthGuard)
  async escanear() {
    return this.gmailService.escanear();
  }

  @Get('solicitudes')
  @UseGuards(SessionAuthGuard)
  async listar(@Query('estado') estado?: EstadoSugerida) {
    return this.gmailService.listar(estado || EstadoSugerida.PENDIENTE);
  }

  @Post('solicitudes/:id/procesar')
  @UseGuards(SessionAuthGuard)
  async procesar(@Param('id') id: string) {
    await this.gmailService.marcarProcesada(+id);
    return { ok: true };
  }

  @Post('solicitudes/:id/descartar')
  @UseGuards(SessionAuthGuard)
  async descartar(@Param('id') id: string) {
    await this.gmailService.marcarDescartada(+id);
    return { ok: true };
  }
}