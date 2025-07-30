import { Cron, CronExpression } from '@nestjs/schedule';
import { MailerService } from '@nestjs-modules/mailer';
import { Between, Not, Like } from 'typeorm';
import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Correspondencia,
  TipoSolicitud,
  EstadoSolicitud,
} from './entities/correspondencia.entity';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto';
import { GoogleDriveService } from '../google-drive/google-drive.service';

@Injectable()
export class CorrespondenciaService {
  constructor(
    @InjectRepository(Correspondencia)
    private correspondenciaRepository: Repository<Correspondencia>,
    private readonly mailerService: MailerService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  /**
   * ✅ Crear nueva correspondencia
   */
async create(createCorrespondenciaDto: CreateCorrespondenciaDto): Promise<Correspondencia> {
  const nuevaCorrespondencia = this.correspondenciaRepository.create(createCorrespondenciaDto);

  // V E R I F I C A R   E S T A   L Í N E A
  nuevaCorrespondencia.fechaRecibido = new Date(); 

  nuevaCorrespondencia.fechaVencimiento = this.calcularFechaVencimiento(
    new Date(),
    nuevaCorrespondencia.tipoSolicitud,
  );

  return this.correspondenciaRepository.save(nuevaCorrespondencia);
}

/**
 * ✅ Obtener una correspondencia por ID
 */
async findOne(id: number): Promise<Correspondencia> {
  const registro = await this.correspondenciaRepository.findOneBy({ id });
    if (!registro) {
      throw new NotFoundException(`El registro con id ${id} no fue encontrado.`);
    }
    return registro;
  }

  /**
   * ✅ Eliminar una correspondencia
   */
  async remove(id: number): Promise<void> {
    const result = await this.correspondenciaRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Correspondencia con id ${id} no encontrada.`);
    }
  }

  /**
   * ✅ Buscar correspondencia con paginación y filtros
   */
  async findAll(
    options: { page: number; limit: number },
    search?: string,
    estado?: EstadoSolicitud,
  ): Promise<{ data: Correspondencia[]; total: number }> {
    const take = options.limit || 10;
    const skip = (options.page - 1) * take;

    const queryBuilder = this.correspondenciaRepository.createQueryBuilder('correspondencia');

    if (search) {
      queryBuilder.andWhere(
        `(correspondencia.radicado ILIKE :search OR 
          correspondencia.remitente ILIKE :search OR 
          correspondencia.asunto ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    if (estado) {
      queryBuilder.andWhere('correspondencia.estado = :estado', { estado });
    }

    const [data, total] = await queryBuilder.skip(skip).take(take).getManyAndCount();

    return { data, total };
  }

  /**
   * ✅ Actualizar correspondencia
   */
  async update(
    id: number,
    updateCorrespondenciaDto: UpdateCorrespondenciaDto,
  ): Promise<Correspondencia> {
    const registro = await this.findOne(id);
    const registroActualizado = this.correspondenciaRepository.merge(
      registro,
      updateCorrespondenciaDto,
    );
    return this.correspondenciaRepository.save(registroActualizado);
  }

  /**
   * ✅ Cron para enviar alertas automáticas
   */
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
  }

  /**
   * ✅ Buscar registros por vencer
   */
  private async buscarRegistrosPorVencer(
    dias: number,
  ): Promise<Correspondencia[]> {
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

  /**
   * ✅ Enviar correo de resumen
   */
  private async enviarCorreoResumen(
    registros: Correspondencia[],
    subject: string,
  ) {
    console.log(`Enviando correo de resumen: ${subject}`);
    try {
      await this.mailerService.sendMail({
        to: process.env.EMAIL_TO,
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

  /**
   * ✅ Adjuntar archivo a Google Drive
   */
  async adjuntarArchivo(id: number, file: Express.Multer.File) {
    const link = await this.googleDriveService.uploadFile(file);
    const registro = await this.findOne(id);
    registro.archivosAnexos = link;
    return this.correspondenciaRepository.save(registro);
  }

  /**
   * ✅ Calcular fecha de vencimiento según días hábiles
   */
  private calcularFechaVencimiento(
    fechaInicio: Date,
    tipo: TipoSolicitud,
  ): Date | null {
    const plazos = new Map<TipoSolicitud, number>([
      [TipoSolicitud.DERECHO_PETICION, 15],
      [TipoSolicitud.QUEJA, 15],
      [TipoSolicitud.RECLAMO, 15],
    ]);

    const dias = plazos.get(tipo);

    if (dias) {
      return this.agregarDiasHabiles(fechaInicio, dias);
    }

    return null;
  }

  /**
   * ✅ Función auxiliar para sumar días hábiles
   */
  private agregarDiasHabiles(fecha: Date, dias: number): Date {
    let fechaCalculada = new Date(fecha);
    let diasAgregados = 0;

    while (diasAgregados < dias) {
      fechaCalculada.setDate(fechaCalculada.getDate() + 1);
      const diaSemana = fechaCalculada.getDay();
      if (diaSemana !== 0 && diaSemana !== 6) {
        diasAgregados++;
      }
    }

    return fechaCalculada;
  }
}
