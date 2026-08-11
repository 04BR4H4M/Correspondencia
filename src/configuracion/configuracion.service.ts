// src/configuracion/configuracion.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { Configuracion } from './entities/configuracion.entity';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { GoogleDriveService } from '../google-drive/google-drive.service';

const ID_UNICO = 1;

@Injectable()
export class ConfiguracionService {
  constructor(
    @InjectRepository(Configuracion)
    private readonly configRepository: Repository<Configuracion>,
    private readonly configService: ConfigService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  /** Devuelve la fila de configuración, creándola con valores por defecto si no existe todavía. */
  private async getOrCreate(): Promise<Configuracion> {
    let config = await this.configRepository.findOne({ where: { id: ID_UNICO } });
    if (!config) {
      config = this.configRepository.create({ id: ID_UNICO });
      config = await this.configRepository.save(config);
    }
    return config;
  }

  /** Configuración para mostrar en el panel de Perfil (sin exponer la contraseña). */
  async obtenerConfiguracionPublica() {
    const config = await this.getOrCreate();
    const conClave = await this.configRepository
      .createQueryBuilder('c')
      .addSelect('c.smtpPass')
      .where('c.id = :id', { id: ID_UNICO })
      .getOne();

    const { smtpPass, ...resto } = config;
    return { ...resto, tieneClaveConfigurada: !!conClave?.smtpPass };
  }

  async actualizar(dto: UpdateConfiguracionDto) {
    const config = await this.getOrCreate();

    if (dto.nombreAdministrador !== undefined) config.nombreAdministrador = dto.nombreAdministrador;
    if (dto.nombreRemitente !== undefined) config.nombreRemitente = dto.nombreRemitente;
    if (dto.smtpHost !== undefined) config.smtpHost = dto.smtpHost;
    if (dto.smtpPort !== undefined) config.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) config.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) config.smtpUser = dto.smtpUser;
    // La contraseña solo se sobreescribe si mandan un valor no vacío.
    if (dto.smtpPass) config.smtpPass = dto.smtpPass;

    await this.configRepository.save(config);
    return this.obtenerConfiguracionPublica();
  }

  async subirFotoPerfil(file: Express.Multer.File) {
    const config = await this.getOrCreate();

    if (config.fotoPerfilId) {
      try {
        await this.googleDriveService.deleteFile(config.fotoPerfilId);
      } catch {
        // Si ya no existe en Drive, seguimos igual con el reemplazo.
      }
    }

    const subida = await this.googleDriveService.uploadFile(file);
    config.fotoPerfil = subida.webViewLink;
    config.fotoPerfilId = subida.id;
    await this.configRepository.save(config);
    return this.obtenerConfiguracionPublica();
  }

  /**
   * Arma un transportador de nodemailer con los datos guardados en base de datos.
   * Si algún dato no está configurado ahí, cae de vuelta a las variables de entorno (.env).
   */
  async getTransporter() {
    const conClave = await this.configRepository
      .createQueryBuilder('c')
      .addSelect('c.smtpPass')
      .where('c.id = :id', { id: ID_UNICO })
      .getOne();

    const host = conClave?.smtpHost || this.configService.get<string>('EMAIL_HOST');
    const user = conClave?.smtpUser || this.configService.get<string>('EMAIL_USER');
    const pass = conClave?.smtpPass || this.configService.get<string>('EMAIL_PASS');

    // El puerto puede venir de la BD (número real) o del .env (siempre string) — normalizamos.
    const portCrudo = conClave?.smtpPort || this.configService.get<string>('EMAIL_PORT');
    const port = parseInt(String(portCrudo), 10) || 465;

    // La seguridad (SSL) puede venir de la BD (boolean real) o del .env (string 'true'/'false').
    // OJO: !!'false' da `true` porque cualquier string no vacío es "truthy" en JS — por eso
    // hay que comparar explícitamente contra el string 'true' cuando viene del .env.
    let secure: boolean;
    if (conClave && conClave.smtpSecure !== null && conClave.smtpSecure !== undefined) {
      secure = conClave.smtpSecure === true || (conClave.smtpSecure as unknown) === 1;
    } else {
      secure = this.configService.get<string>('EMAIL_SECURE') === 'true';
    }
    // Salvaguarda extra: el puerto 465 de Gmail SIEMPRE es SSL implícito (secure:true);
    // si por algún dato viejo quedó en false, lo corregimos para evitar el error
    // "wrong version number" típico de este mismatch.
    if (port === 465) secure = true;
    if (port === 587) secure = false;

    console.log(`[Correo] Conectando a ${host}:${port} (secure=${secure}) con usuario ${user}`);

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  async getFromAddress(): Promise<string> {
    const config = await this.getOrCreate();
    const nombre = config.nombreRemitente || 'Sistema de Correspondencia';
    const correo = config.smtpUser || this.configService.get<string>('EMAIL_USER');
    return `"${nombre}" <${correo}>`;
  }
}