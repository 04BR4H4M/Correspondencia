// src/correspondencia/dto/create-correspondencia.dto.ts
import { IsEnum, IsNotEmpty, IsString, IsDateString, IsOptional } from 'class-validator';
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
  // ... dentro de CreateCorrespondenciaDto
@IsString() 
@IsOptional() 
cargoEntidad?: string;

@IsString() 
@IsOptional() 
formaEnvio?: string;

@IsString()
@IsOptional()
observaciones?: string;

 @IsDateString() // Valida que sea una fecha
  @IsOptional()   // La hace opcional
  fechaRecibido?: string;

@IsString()
@IsOptional()
correoRemitente?: string;
}