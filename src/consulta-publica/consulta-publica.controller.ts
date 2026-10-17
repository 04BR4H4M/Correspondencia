// src/consulta-publica/consulta-publica.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { CorrespondenciaService } from '../correspondencia/correspondencia.service';

// OJO: este controller NO lleva @UseGuards(SessionAuthGuard) a propósito —
// es la única parte del sistema pensada para que la use un ciudadano
// cualquiera, sin iniciar sesión. La "autenticación" aquí es que el
// radicado y el correo coincidan exactamente (ver CorrespondenciaService.consultarPublico).
@Controller('consulta-publica')
export class ConsultaPublicaController {
  constructor(private readonly correspondenciaService: CorrespondenciaService) {}

  @Get()
  async consultar(@Query('radicado') radicado?: string, @Query('correo') correo?: string) {
    if (!radicado || !correo) {
      throw new BadRequestException('Debes indicar el número de radicado y el correo electrónico.');
    }
    return this.correspondenciaService.consultarPublico(radicado.trim(), correo.trim());
  }
}