// src/solicitudes-gmail/solicitudes-gmail.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudSugerida } from './entities/solicitud-sugerida.entity';
import { SolicitudesGmailService } from './solicitudes-gmail.service';
import { SolicitudesGmailController } from './solicitudes-gmail.controller';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [TypeOrmModule.forFeature([SolicitudSugerida]), ConfiguracionModule],
  controllers: [SolicitudesGmailController],
  providers: [SolicitudesGmailService],
})
export class SolicitudesGmailModule {}