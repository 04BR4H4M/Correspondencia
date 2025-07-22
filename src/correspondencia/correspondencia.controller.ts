// src/correspondencia/correspondencia.controller.ts
import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { CorrespondenciaService } from './correspondencia.service';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto'; // Añade esta importación
import { Patch } from '@nestjs/common'; // Asegúrate de importar Patch


@Controller('correspondencia')
export class CorrespondenciaController {
  constructor(private readonly correspondenciaService: CorrespondenciaService) {}

  /**
   * Endpoint para crear un nuevo registro de correspondencia.
   * URL: POST /correspondencia
   */
  @Post()
  create(@Body() createCorrespondenciaDto: CreateCorrespondenciaDto) {
    return this.correspondenciaService.create(createCorrespondenciaDto);
  }

@Get()
findAll() {
  return this.correspondenciaService.findAll();
}

@Get(':id')
findOne(@Param('id') id: string) {
  return this.correspondenciaService.findOne(+id);
}

/**
 * Endpoint para eliminar una correspondencia por su id.
 * URL: DELETE /correspondencia/:id
 */
@Delete(':id')
remove(@Param('id') id: string) {
  return this.correspondenciaService.remove(+id);
}

/**
 * Endpoint para actualizar parcialmente una correspondencia.
 * URL: PATCH /correspondencia/:id
 */
@Patch(':id')
update(
  @Param('id') id: string,
  @Body() updateCorrespondenciaDto: UpdateCorrespondenciaDto,
) {
  return this.correspondenciaService.update(+id, updateCorrespondenciaDto);
}
}
