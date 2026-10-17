// src/consulta-publica/consulta-publica.module.ts
import { Module } from '@nestjs/common';
import { ConsultaPublicaController } from './consulta-publica.controller';
import { CorrespondenciaModule } from '../correspondencia/correspondencia.module';

@Module({
  imports: [CorrespondenciaModule], // ya exporta CorrespondenciaService
  controllers: [ConsultaPublicaController],
})
export class ConsultaPublicaModule {}