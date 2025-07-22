// src/correspondencia/correspondencia.module.ts
import { Module } from '@nestjs/common';
import { CorrespondenciaService } from './correspondencia.service';
import { CorrespondenciaController } from './correspondencia.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Correspondencia } from './entities/correspondencia.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Correspondencia])], // <--- ESTA LÍNEA ES LA CLAVE
  controllers: [CorrespondenciaController],
  providers: [CorrespondenciaService],
})
export class CorrespondenciaModule {}