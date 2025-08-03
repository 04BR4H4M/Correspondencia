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
} from '@nestjs/common';
import { CorrespondenciaService } from './correspondencia.service';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto';
import { EstadoSolicitud } from './entities/correspondencia.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { BulkDeleteDto } from './dto/bulk-delete.dto'; // Asegúrate de tener este DTO para manejar la eliminación masiva

@Controller('correspondencia')
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
    @Query('sortBy') sortBy: string = 'id',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.correspondenciaService.findAll(
      { page: pageNumber, limit: limitNumber, sortBy, sortOrder },
      search,
      estado,
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
  // Dentro de CorrespondenciaController
@Get('test/verificar-drive')
verificarDrive() {
  return this.correspondenciaService.testDriveAccess();
}

@Post('bulk-delete')
removeMany(@Body() bulkDeleteDto: BulkDeleteDto) {
  return this.correspondenciaService.removeMany(bulkDeleteDto.ids);
}
}
