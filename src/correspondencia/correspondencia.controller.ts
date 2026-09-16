// src/correspondencia/correspondencia.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Header,
  BadRequestException,
} from '@nestjs/common';
import { CorrespondenciaService } from './correspondencia.service';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto';
import { ContestarCorrespondenciaDto } from './dto/contestar-correspondencia.dto';
import { EstadoSolicitud, TipoSolicitud } from './entities/correspondencia.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { BulkDeleteDto } from './dto/bulk-delete.dto'; // Asegúrate de tener este DTO para manejar la eliminación masiva
import { UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Controller('correspondencia')
@UseGuards(SessionAuthGuard)
export class CorrespondenciaController {
  constructor(
    private readonly correspondenciaService: CorrespondenciaService,
  ) {}

  @Post()
  create(@Body() createCorrespondenciaDto: CreateCorrespondenciaDto) {
    return this.correspondenciaService.create(createCorrespondenciaDto);
  }

  /**
   * ✅ Obtener todas las correspondencias (con filtros y paginación)
   * GET /correspondencia?search=...&estado=...
   */
  @Get()
  findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('estado') estado?: EstadoSolicitud,
    @Query('tipoSolicitud') tipoSolicitud?: TipoSolicitud,
    @Query('sortBy') sortBy: string = 'id',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.correspondenciaService.findAll(
      { page: pageNumber, limit: limitNumber, sortBy, sortOrder },
      search,
      estado,
      tipoSolicitud,
    );
  }

  /**
   * ✅ Obtener una correspondencia por ID
   * GET /correspondencia/:id
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.correspondenciaService.findOne(+id);
  }

  /**
   * ✅ Eliminar correspondencia por ID
   * DELETE /correspondencia/:id
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.correspondenciaService.remove(+id);
  }

  /**
   * ✅ Actualizar correspondencia
   * PATCH /correspondencia/:id
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCorrespondenciaDto: UpdateCorrespondenciaDto,
  ) {
    return this.correspondenciaService.update(+id, updateCorrespondenciaDto);
  }

  /**
   * ✅ Adjuntar archivo (subir a Google Drive)
   * POST /correspondencia/:id/adjuntar
   */
  @Post(':id/adjuntar')
  @UseInterceptors(FileInterceptor('file'))
  adjuntarArchivo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.correspondenciaService.adjuntarArchivo(+id, file);
  }

  /**
   * ✅ Eliminar el archivo adjunto de Google Drive
   * DELETE /correspondencia/:id/adjunto
   */
  @Delete(':id/adjunto')
  eliminarArchivo(@Param('id') id: string) {
    return this.correspondenciaService.eliminarArchivo(+id);
  }

  /**
   * ✅ Contestar el radicado desde el aplicativo (envía el correo y deja trazabilidad)
   * POST /correspondencia/:id/contestar
   */
  @Post(':id/contestar')
  @UseInterceptors(FileInterceptor('file'))
  contestar(
    @Param('id') id: string,
    @Body() contestarDto: ContestarCorrespondenciaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.correspondenciaService.contestar(+id, contestarDto, file);
  }
  // Dentro de CorrespondenciaController
@Get('test/verificar-drive')
verificarDrive() {
  return this.correspondenciaService.testDriveAccess();
}

/**
 * ⚠️ SOLO PARA PRUEBAS: dispara manualmente la misma lógica que corre
 * automáticamente todos los días a las 8am, sin esperar ni tocar la hora
 * del sistema. Revisa el correo configurado en EMAIL_TO y la consola del
 * servidor para ver el resultado.
 * GET /correspondencia/test/verificar-alertas
 */
@Get('test/verificar-alertas')
verificarAlertas() {
  return this.correspondenciaService.manejarAlertasDeVencimiento();
}

@Post('bulk-delete')
removeMany(@Body() bulkDeleteDto: BulkDeleteDto) {
  return this.correspondenciaService.removeMany(bulkDeleteDto.ids);
}

  /**
   * ✅ Descarga la ficha de trazabilidad de un radicado en PDF
   * GET /correspondencia/:id/informe-pdf
   */
  @Get(':id/informe-pdf')
  @Header('Content-Type', 'application/pdf')
  async descargarInformePdf(@Param('id') id: string) {
    const registro = await this.correspondenciaService.findOne(+id);
    const buffer = await this.correspondenciaService.generarInformePdf(+id);
    const nombreArchivo = `informe-${registro.radicado.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${nombreArchivo}"`,
    });
  }

  /**
   * ✅ Descarga el informe de gestión/cumplimiento en PDF para un periodo
   * GET /correspondencia/informes/periodo-pdf?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&titulo=...
   */
  @Get('informes/periodo-pdf')
  @Header('Content-Type', 'application/pdf')
  async descargarInformePeriodoPdf(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('titulo') titulo: string,
    @Query('estado') estado?: EstadoSolicitud,
    @Query('tipoSolicitud') tipoSolicitud?: TipoSolicitud,
  ) {
    if (!desde || !hasta) {
      throw new BadRequestException('Debes indicar la fecha de inicio y fin del periodo.');
    }

    const buffer = await this.correspondenciaService.generarInformePeriodoPdf(
      desde,
      hasta,
      titulo || `${desde} a ${hasta}`,
      estado,
      tipoSolicitud,
    );

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="informe-gestion-${desde}_a_${hasta}.pdf"`,
    });
  }
}