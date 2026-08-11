// src/configuracion/dto/update-configuracion.dto.ts
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConfiguracionDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  nombreAdministrador?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  nombreRemitente?: string;

  @IsString()
  @IsOptional()
  smtpHost?: string;

  @IsInt()
  @IsOptional()
  smtpPort?: number;

  @IsBoolean()
  @IsOptional()
  smtpSecure?: boolean;

  @IsEmail()
  @IsOptional()
  smtpUser?: string;

  // Si viene vacío/omitido, se conserva la contraseña que ya estaba guardada.
  @IsString()
  @IsOptional()
  smtpPass?: string;
}