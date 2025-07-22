// src/correspondencia/correspondencia.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CorrespondenciaService } from './correspondencia.service';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';

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

}
