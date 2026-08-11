// src/configuracion/configuracion.controller.ts
import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfiguracionService } from './configuracion.service';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  @Get()
  obtener() {
    return this.configuracionService.obtenerConfiguracionPublica();
  }

  @Patch()
  actualizar(@Body() dto: UpdateConfiguracionDto) {
    return this.configuracionService.actualizar(dto);
  }

  @Post('foto')
  @UseInterceptors(FileInterceptor('file'))
  subirFoto(@UploadedFile() file: Express.Multer.File) {
    return this.configuracionService.subirFotoPerfil(file);
  }
}