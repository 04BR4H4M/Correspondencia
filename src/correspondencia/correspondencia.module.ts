// src/correspondencia/correspondencia.module.ts
import { Module } from '@nestjs/common';
import { CorrespondenciaService } from './correspondencia.service';
import { CorrespondenciaController } from './correspondencia.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Correspondencia } from './entities/correspondencia.entity';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [TypeOrmModule.forFeature([Correspondencia]), ConfiguracionModule], // <--- ESTA LÍNEA ES LA CLAVE
  controllers: [CorrespondenciaController],
  providers: [CorrespondenciaService, GoogleDriveService],
})
export class CorrespondenciaModule {}