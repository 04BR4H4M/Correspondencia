import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailerService } from '@nestjs-modules/mailer';
import * as nodemailer from 'nodemailer';

import {
  Correspondencia,
  TipoSolicitud,
  EstadoSolicitud,
} from './entities/correspondencia.entity';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto';
import { ContestarCorrespondenciaDto } from './dto/contestar-correspondencia.dto';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { In } from 'typeorm';

@Injectable()
export class CorrespondenciaService {
  constructor(
    @InjectRepository(Correspondencia)
    private correspondenciaRepository: Repository<Correspondencia>,
    private readonly mailerService: MailerService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async create(createCorrespondenciaDto: CreateCorrespondenciaDto): Promise<Correspondencia> {
    const { radicado } = createCorrespondenciaDto;
    const registroExistente = await this.correspondenciaRepository.findOneBy({ radicado });

    if (registroExistente) {
      throw new ConflictException(`El número de radicado '${radicado}' ya existe.`);
    }

    const nuevaCorrespondencia = this.correspondenciaRepository.create(createCorrespondenciaDto);

    nuevaCorrespondencia.fechaRecibido = createCorrespondenciaDto.fechaRecibido
      ? new Date(createCorrespondenciaDto.fechaRecibido)
      : new Date();

    nuevaCorrespondencia.estado = EstadoSolicitud.RECIBIDO;
    nuevaCorrespondencia.fechaVencimiento = this.calcularFechaVencimiento(
      nuevaCorrespondencia.fechaRecibido,
      nuevaCorrespondencia.tipoSolicitud,
    );

    return this.correspondenciaRepository.save(nuevaCorrespondencia);
  }

  async findAll(
    options: { page: number; limit: number; sortBy: string; sortOrder: 'ASC' | 'DESC' },
    search?: string,
    estado?: EstadoSolicitud,
  ): Promise<{ data: Correspondencia[]; total: number }> {
    const take = options.limit || 10;
    const skip = (options.page - 1) * take;

    const queryBuilder = this.correspondenciaRepository.createQueryBuilder('correspondencia');

    if (search) {
      // --- CORRECCIÓN 1: Usar .where() para la primera condición ---
        queryBuilder.where(
      '(correspondencia.radicado LIKE :search OR correspondencia.remitente LIKE :search OR correspondencia.asunto LIKE :search)',
      { search: `%${search}%` }
    );
    }

    if (estado) {
      const method = search ? 'andWhere' : 'where';
    queryBuilder[method]('correspondencia.estado = :estado', { estado });
  }

    queryBuilder.orderBy(`correspondencia.${options.sortBy}`, options.sortOrder);

    const [data, total] = await queryBuilder.skip(skip).take(take).getManyAndCount();

    return { data, total };
  }
  
  async findOne(id: number): Promise<Correspondencia> {
    const registro = await this.correspondenciaRepository.findOneBy({ id });
    if (!registro) {
      throw new NotFoundException(`El registro con id ${id} no fue encontrado.`);
    }
    return registro;
  }
async update(id: number, updateCorrespondenciaDto: UpdateCorrespondenciaDto): Promise<Correspondencia> {
  // Validación de radicado duplicado (sin cambios)
  if (updateCorrespondenciaDto.radicado) {
    const registroExistente = await this.correspondenciaRepository.findOne({
      where: { radicado: updateCorrespondenciaDto.radicado, id: Not(id) },
    });
    if (registroExistente) {
      throw new ConflictException(`El número de radicado '${updateCorrespondenciaDto.radicado}' ya está en uso por otro registro.`);
    }
  }

  const registro = await this.findOne(id);

  // --- AJUSTE DE ZONA HORARIA PARA FECHA MANUAL ---
  if (updateCorrespondenciaDto.fechaContestacion) {
    // Convertimos el string 'YYYY-MM-DD' a un objeto Date en la zona horaria local
    const dateStr = updateCorrespondenciaDto.fechaContestacion.toString().split('T')[0];
    updateCorrespondenciaDto.fechaContestacion = new Date(`${dateStr}T00:00:00`);
  }

  const registroActualizado = this.correspondenciaRepository.merge(registro, updateCorrespondenciaDto);

  // Recalcular fecha de vencimiento si es necesario (sin cambios)
  if (updateCorrespondenciaDto.tipoSolicitud || updateCorrespondenciaDto.fechaRecibido) {
    registroActualizado.fechaVencimiento = this.calcularFechaVencimiento(
      registroActualizado.fechaRecibido,
      registroActualizado.tipoSolicitud,
    );
  }

  // --- AJUSTE DE ZONA HORARIA PARA FECHA AUTOMÁTICA ---
  if (registroActualizado.estado === EstadoSolicitud.RESPONDIDO && !registroActualizado.fechaContestacion) {
    // Creamos la fecha de hoy, pero asegurándonos de que esté al inicio del día en la zona local
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // La establece a las 00:00 de la hora local
    registroActualizado.fechaContestacion = hoy;
  }

  return this.correspondenciaRepository.save(registroActualizado);
}


  async remove(id: number): Promise<void> {
    const result = await this.correspondenciaRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Correspondencia con id ${id} no encontrada.`);
    }
  }

  async adjuntarArchivo(id: number, file: Express.Multer.File) {
    const { id: driveId, webViewLink } = await this.googleDriveService.uploadFile(file);
    const registro = await this.findOne(id);
    registro.archivosAnexos = webViewLink;
    registro.archivoAnexoId = driveId;
    return this.correspondenciaRepository.save(registro);
  }

  async eliminarArchivo(id: number) {
    const registro = await this.findOne(id);
    if (!registro.archivosAnexos) {
      throw new NotFoundException('Este registro no tiene ningún archivo adjunto.');
    }
    if (registro.archivoAnexoId) {
      await this.googleDriveService.deleteFile(registro.archivoAnexoId);
    }
    registro.archivosAnexos = null;
    registro.archivoAnexoId = null;
    return this.correspondenciaRepository.save(registro);
  }

  async contestar(
    id: number,
    contestarDto: ContestarCorrespondenciaDto,
    file?: Express.Multer.File,
  ) {
    const registro = await this.findOne(id);

    if (!registro.correoRemitente) {
      throw new BadRequestException(
        'Este radicado no tiene un correo de remitente registrado. Edítalo en Radicación para poder responderlo desde aquí.',
      );
    }

    let archivoRespuestaLink: string | undefined;
    let archivoRespuestaId: string | undefined;

    const adjuntosCorreo: { filename: string; content: Buffer }[] = [];

    if (file) {
      const subido = await this.googleDriveService.uploadFile(file);
      archivoRespuestaLink = subido.webViewLink;
      archivoRespuestaId = subido.id;
      adjuntosCorreo.push({ filename: file.originalname, content: file.buffer });
    }

    // Convertimos el mensaje de texto plano a HTML simple (respetando saltos de línea).
    // Es necesario mandar `html` porque @nestjs-modules/mailer solo se salta el paso
    // de compilar una plantilla Handlebars cuando `mail.data.html` está presente;
    // si solo mandamos `text`, intenta compilar `template` (que aquí no existe) y falla.
    const mensajeHtml = contestarDto.mensaje
      .split('\n')
      .map((linea) => this.escaparHtml(linea))
      .join('<br>');

    try {
      await this.mailerService.sendMail({
        to: registro.correoRemitente,
        subject: `Respuesta a su radicado ${registro.radicado}`,
        text: contestarDto.mensaje,
        html: mensajeHtml,
        attachments: adjuntosCorreo.length ? adjuntosCorreo : undefined,
      });
    } catch (error) {
      // Dejamos el error completo en el log del servidor para poder
      // diagnosticar problemas de SMTP (auth, TLS, etc.) sin exponerlos al cliente.
      console.error('Error al enviar el correo de respuesta:', error);
      throw new BadRequestException(
        'No se pudo enviar el correo de respuesta. Verifica la configuración de correo (host, puerto, usuario/clave) y vuelve a intentarlo.',
      );
    }

    registro.respuestaMensaje = contestarDto.mensaje;
    registro.respuestaEnviadaEn = new Date();
    if (archivoRespuestaLink) {
      registro.archivoRespuesta = archivoRespuestaLink;
      registro.archivoRespuestaId = archivoRespuestaId ?? null;
    }
    registro.estado = EstadoSolicitud.RESPONDIDO;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    registro.fechaContestacion = hoy;

    return this.correspondenciaRepository.save(registro);
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async manejarAlertasDeVencimiento() {
    console.log('Ejecutando revisión de vencimientos...');

    const alerta3Dias = await this.buscarRegistrosPorVencer(3);
    if (alerta3Dias.length > 0) {
      await this.enviarCorreoResumen(
        alerta3Dias,
        'ALERTA URGENTE: Registros vencen en 3 días',
      );
    }

    const alerta1Dia = await this.buscarRegistrosPorVencer(1);
    if (alerta1Dia.length > 0) {
      await this.enviarCorreoResumen(
        alerta1Dia,
        'ALERTA FINAL: Registros vencen MAÑANA',
      );
    }

    return {
      ejecutadoEn: new Date().toISOString(),
      alerta3Dias: alerta3Dias.map((r) => r.radicado),
      alerta1Dia: alerta1Dia.map((r) => r.radicado),
    };
  }

  private async buscarRegistrosPorVencer(dias: number): Promise<Correspondencia[]> {
    const hoy = new Date();
  const fechaVencimiento = new Date();
  fechaVencimiento.setDate(hoy.getDate() + dias);

  return this.correspondenciaRepository.find({
    where: {
      fechaVencimiento: Between(
        new Date(fechaVencimiento.setHours(0, 0, 0, 0)),
        new Date(fechaVencimiento.setHours(23, 59, 59, 999)),
      ),
      estado: Not(EstadoSolicitud.RESPONDIDO),
    },
  });
}
  private async enviarCorreoResumen(registros: Correspondencia[], subject: string) {
    const destinatario = process.env.EMAIL_TO;
    if (!destinatario) {
      console.error(
        'No se pudo enviar el correo de alertas: falta la variable EMAIL_TO en el archivo .env.',
      );
      return;
    }

    console.log(`Enviando correo de resumen: ${subject}`);
    try {
      await this.mailerService.sendMail({
        to: destinatario,
        subject: subject,
        template: './alerta-vencimiento',
        context: {
          titulo: subject,
          cantidad: registros.length,
          registros: registros,
        },
      });
      console.log('Correo con plantilla enviado exitosamente.');
    } catch (error) {
      console.error('Error al enviar el correo con plantilla:', error);
    }
  }

  private calcularFechaVencimiento(fechaInicio: Date, tipo: TipoSolicitud): Date | null {
   const plazosRespuesta = new Map<TipoSolicitud, number>([
    [TipoSolicitud.DERECHO_PETICION, 15],
    [TipoSolicitud.QUEJA, 15],
    [TipoSolicitud.RECLAMO, 15],
  ]);

  const diasASumar = plazosRespuesta.get(tipo);

  if (diasASumar) {
    return this.agregarDiasHabiles(fechaInicio, diasASumar);
  }
  return null;
}
  private agregarDiasHabiles(fecha: Date, dias: number): Date {
  let fechaCalculada = new Date(fecha);
  let diasAgregados = 0;

  while (diasAgregados < dias) {
    fechaCalculada.setDate(fechaCalculada.getDate() + 1);
    const diaDeLaSemana = fechaCalculada.getDay(); // 0 = Domingo, 6 = Sábado
    if (diaDeLaSemana !== 0 && diaDeLaSemana !== 6) {
      diasAgregados++;
    }
  }
  return fechaCalculada;
}

  private escaparHtml(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async testDriveAccess() {
    return this.googleDriveService.verifyFolderAccess();
  }

  async removeMany(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await this.correspondenciaRepository.delete({
    id: In(ids),
  });
}
}