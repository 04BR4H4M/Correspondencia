// src/correspondencia/correspondencia.service.ts
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailerService } from '@nestjs-modules/mailer';
import { LessThanOrEqual, MoreThanOrEqual, Not } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Correspondencia,
  TipoSolicitud,
  EstadoSolicitud,
} from './entities/correspondencia.entity';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto';

@Injectable()
export class CorrespondenciaService {
  constructor(
    @InjectRepository(Correspondencia)
    private correspondenciaRepository: Repository<Correspondencia>,
    private readonly mailerService: MailerService,
  ) {}

  async create(createCorrespondenciaDto: CreateCorrespondenciaDto): Promise<Correspondencia> {
    const nuevaCorrespondencia = this.correspondenciaRepository.create(createCorrespondenciaDto);

    nuevaCorrespondencia.fechaVencimiento = this.calcularFechaVencimiento(
      new Date(),
      nuevaCorrespondencia.tipoSolicitud,
    );

    return this.correspondenciaRepository.save(nuevaCorrespondencia);
  }

  async findOne(id: number): Promise<Correspondencia> {
    const registro = await this.correspondenciaRepository.findOneBy({ id });
    if (!registro) {
      throw new NotFoundException(`El registro con el id ${id} no fue encontrado.`);
    }
    return registro;
  }

  async remove(id: number): Promise<void> {
    const result = await this.correspondenciaRepository.delete(id);
    if (result.affected === 0) {
      throw new Error(`Correspondencia con id ${id} no encontrada.`);
    }
  }

  findAll(): Promise<Correspondencia[]> {
    return this.correspondenciaRepository.find();
  }

  private calcularFechaVencimiento(
    fechaInicio: Date,
    tipo: TipoSolicitud,
  ): Date | null {
    const plazosRespuesta = new Map<TipoSolicitud, number>([
      [TipoSolicitud.DERECHO_PETICION, 15],
      [TipoSolicitud.QUEJA, 10],
      [TipoSolicitud.RECLAMO, 10],
      [TipoSolicitud.SUGERENCIA, 20],
    ]);

    const diasASumar = plazosRespuesta.get(tipo);

    if (diasASumar) {
      const fechaVencimiento = new Date(fechaInicio);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasASumar);
      return fechaVencimiento;
    }

    return null;
  }

  async update(id: number, updateCorrespondenciaDto: UpdateCorrespondenciaDto): Promise<Correspondencia> {
    const registro = await this.findOne(id);
    const registroActualizado = this.correspondenciaRepository.merge(registro, updateCorrespondenciaDto);
    return this.correspondenciaRepository.save(registroActualizado);
  }
@Cron(CronExpression.EVERY_10_SECONDS) // Usamos 10 segundos para probar
async manejarAlertasDeVencimiento() {
  console.log('--- [CRON INICIADO] ---');

  // 1. Verificamos si el MailerService existe en este contexto
  if (!this.mailerService) {
    console.error('[CRON ERROR] MailerService no está disponible aquí.');
    return; // Detenemos si no hay servicio de correo
  }
  console.log('[CRON INFO] MailerService está disponible.');

  // 2. Buscamos los registros
  const registrosPorVencer = await this.correspondenciaRepository.find({
    where: {
      fechaVencimiento: MoreThanOrEqual(new Date()) && LessThanOrEqual(new Date(new Date().setDate(new Date().getDate() + 3))),
      estado: Not(EstadoSolicitud.RESPONDIDO),
    },
  });
  console.log(`[CRON INFO] Se encontraron ${registrosPorVencer.length} registros.`);

  if (registrosPorVencer.length > 0) {
    const contexto = {
      titulo: 'Resumen de Correspondencia Próxima a Vencer',
      cantidad: registrosPorVencer.length,
      registros: registrosPorVencer,
    };
    console.log('[CRON INFO] Contexto para la plantilla creado.');

    // 3. Intentamos enviar el correo
    try {
      console.log('[CRON INFO] Intentando enviar correo...');
      await this.mailerService.sendMail({
        to: process.env.EMAIL_TO,
        subject: `ALERTA: ${registrosPorVencer.length} Registros Próximos a Vencer`,
        template: './alerta-vencimiento',
        context: contexto,
      });
      console.log('--- [CRON ÉXITO] --- Correo entregado al servidor de Gmail.');
    } catch (error) {
      console.error('--- [CRON ERROR FATAL] --- Error al enviar correo:', error);
    }
  } else {
    console.log('--- [CRON FINALIZADO] --- No hay registros para notificar.');
  }
}

// ... dentro de la clase CorrespondenciaService

async enviarCorreoDePrueba() {
  try {
    await this.mailerService.sendMail({
      to: process.env.EMAIL_TO,
      subject: '✅ Correo de Prueba desde la Aplicación',
      template: './alerta-vencimiento', // Reutilizamos la plantilla
      context: {
        titulo: '¡Prueba de Envío Exitosa!',
        cantidad: 1,
        registros: [
          {
            radicado: 'TEST-001',
            remitente: 'Sistema de Pruebas',
            asunto: 'Verificación de envío de correo.',
            fechaVencimiento: 'Inmediata',
          },
        ],
      },
    });
    return { message: 'Correo de prueba enviado exitosamente.' };
  } catch (error) {
    console.error('Error detallado al enviar correo:', error);
    throw new Error('Falló el envío del correo de prueba.');
  }
}
}
