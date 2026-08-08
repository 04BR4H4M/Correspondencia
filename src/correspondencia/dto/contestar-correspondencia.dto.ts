// src/correspondencia/dto/contestar-correspondencia.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class ContestarCorrespondenciaDto {
  @IsString()
  @IsNotEmpty()
  mensaje: string;
}