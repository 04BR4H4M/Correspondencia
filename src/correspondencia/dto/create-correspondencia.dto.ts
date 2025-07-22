// src/correspondencia/dto/create-correspondencia.dto.ts
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { TipoSolicitud } from '../entities/correspondencia.entity';

export class CreateCorrespondenciaDto {
  @IsString()
  @IsNotEmpty()
  radicado: string;

  @IsString()
  @IsNotEmpty()
  remitente: string;

  @IsString()
  @IsNotEmpty()
  asunto: string;

  @IsEnum(TipoSolicitud)
  @IsNotEmpty()
  tipoSolicitud: TipoSolicitud;
}