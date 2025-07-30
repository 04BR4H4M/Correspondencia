// src/correspondencia/dto/update-correspondencia.dto.ts
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { EstadoSolicitud, TipoSolicitud } from '../entities/correspondencia.entity'; // Importa EstadoSolicitud
import { IsDateString } from 'class-validator';

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

  @IsEnum(EstadoSolicitud) // Valida que sea uno de los estados permitidos
  @IsOptional()
  estado?: EstadoSolicitud; // Añade esta propiedad

@IsDateString() 
@IsOptional() 
fechaContestacion?: Date;

@IsString() 
@IsOptional() 
cargoEntidad?: string;

@IsString() 
@IsOptional() 
formaEnvio?: string;

@IsString() 
@IsOptional() 
observaciones?: string;

@IsDateString()
@IsOptional()
fechaRecibido?: Date;

}
