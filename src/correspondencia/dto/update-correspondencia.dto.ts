// src/correspondencia/dto/update-correspondencia.dto.ts
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { TipoSolicitud } from '../entities/correspondencia.entity';

export class UpdateCorrespondenciaDto {
  @IsString()
  @IsOptional()
  radicado?: string;

  @IsString()
  @IsOptional()
  remitente?: string;

  @IsString()
  @IsOptional()
  asunto?: string;

  @IsEnum(TipoSolicitud)
  @IsOptional()
  tipoSolicitud?: TipoSolicitud;
}