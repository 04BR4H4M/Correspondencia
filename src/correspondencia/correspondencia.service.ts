import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';

import {
  Correspondencia,
  TipoSolicitud,
  EstadoSolicitud,
} from './entities/correspondencia.entity';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto';
import { ContestarCorrespondenciaDto } from './dto/contestar-correspondencia.dto';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { In } from 'typeorm';

@Injectable()
export class CorrespondenciaService {
  constructor(
    @InjectRepository(Correspondencia)
    private correspondenciaRepository: Repository<Correspondencia>,
    private readonly googleDriveService: GoogleDriveService,
    private readonly configuracionService: ConfiguracionService,
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
    tipoSolicitud?: TipoSolicitud,
  ): Promise<{ data: Correspondencia[]; total: number }> {
    const take = options.limit || 10;
    const skip = (options.page - 1) * take;

    const queryBuilder = this.correspondenciaRepository.createQueryBuilder('correspondencia');
    let tieneCondicion = false;

    if (search) {
      queryBuilder.where(
      '(correspondencia.radicado LIKE :search OR correspondencia.remitente LIKE :search OR correspondencia.asunto LIKE :search)',
      { search: `%${search}%` }
    );
      tieneCondicion = true;
    }

    if (estado) {
      queryBuilder[tieneCondicion ? 'andWhere' : 'where']('correspondencia.estado = :estado', { estado });
      tieneCondicion = true;
  }

    if (tipoSolicitud) {
      queryBuilder[tieneCondicion ? 'andWhere' : 'where']('correspondencia.tipoSolicitud = :tipoSolicitud', { tipoSolicitud });
      tieneCondicion = true;
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
      const transporter = await this.configuracionService.getTransporter();
      const from = await this.configuracionService.getFromAddress();

      await transporter.sendMail({
        from,
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
        'media',
      );
    }

    const alerta1Dia = await this.buscarRegistrosPorVencer(1);
    if (alerta1Dia.length > 0) {
      await this.enviarCorreoResumen(
        alerta1Dia,
        'ALERTA FINAL: Registros vencen MAÑANA',
        'alta',
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
  private async enviarCorreoResumen(
    registros: Correspondencia[],
    subject: string,
    nivelUrgencia: 'media' | 'alta',
  ) {
    const destinatario = process.env.EMAIL_TO;
    if (!destinatario) {
      console.error(
        'No se pudo enviar el correo de alertas: falta la variable EMAIL_TO en el archivo .env.',
      );
      return;
    }

    console.log(`Enviando correo de resumen: ${subject}`);
    try {
      const transporter = await this.configuracionService.getTransporter();
      const from = await this.configuracionService.getFromAddress();

      const rutaPlantilla = join(process.cwd(), 'templates', 'alerta-vencimiento.hbs');
      const plantillaCruda = await readFile(rutaPlantilla, 'utf8');
      const plantillaCompilada = handlebars.compile(plantillaCruda);
      const html = plantillaCompilada({
        titulo: subject,
        cantidad: registros.length,
        registros: registros,
        nivelUrgencia,
        esAlta: nivelUrgencia === 'alta',
        esUno: registros.length === 1,
      });

      await transporter.sendMail({
        from,
        to: destinatario,
        subject: subject,
        html,
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

  // ==========================================================
  // INFORMES EN PDF
  // ==========================================================

  private formatearFechaPdf(fecha: Date | string | null): string {
    if (!fecha) return 'No aplica';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  private colores = {
    texto: '#0f172a',
    muted: '#64748b',
    primario: '#2563eb',
    borde: '#e2e8f0',
    exito: '#059669',
    advertencia: '#d97706',
    peligro: '#dc2626',
  };

  private dibujarEncabezadoPdf(doc: PDFKit.PDFDocument, eyebrow: string, titulo: string, subtitulo?: string) {
    doc
      .fillColor(this.colores.texto)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Concejo Municipal de Nilo');
    doc
      .fillColor(this.colores.muted)
      .fontSize(9)
      .font('Helvetica')
      .text('Sistema de Gestión de Correspondencia · Cundinamarca');

    doc.moveDown(0.6);
    doc.strokeColor(this.colores.borde).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.fillColor(this.colores.primario).fontSize(9).font('Helvetica-Bold').text(eyebrow.toUpperCase());
    doc.fillColor(this.colores.texto).fontSize(13).font('Helvetica-Bold').text(titulo);
    if (subtitulo) {
      doc.fillColor(this.colores.muted).fontSize(9).font('Helvetica').text(subtitulo);
    }
    doc
      .fillColor(this.colores.muted)
      .fontSize(8)
      .font('Helvetica')
      .text(`Generado el ${this.formatearFechaPdf(new Date())}`);
    doc.moveDown(1);
  }

  /**
   * Genera la ficha/informe de trazabilidad de un radicado en PDF,
   * para usar como soporte documental (adjuntar a una solicitud, demanda, etc.).
   */
  async generarInformePdf(id: number): Promise<Buffer> {
    const registro = await this.findOne(id);
    const { texto: colorTexto, muted: colorMuted, borde: colorBorde } = this.colores;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.dibujarEncabezadoPdf(doc, 'Informe de trazabilidad', `Radicado ${registro.radicado}`);

      const campo = (etiqueta: string, valor: string) => {
        const y = doc.y;
        doc.fillColor(colorMuted).fontSize(9).font('Helvetica-Bold').text(etiqueta.toUpperCase(), 50, y, { width: 160 });
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(valor || 'No registrado', 220, y, { width: 325 });
        doc.moveDown(0.55);
      };

      const seccion = (titulo: string) => {
        doc.moveDown(0.3);
        doc.fillColor(colorTexto).fontSize(11).font('Helvetica-Bold').text(titulo);
        doc.strokeColor(colorBorde).lineWidth(0.7).moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.moveDown(0.6);
      };

      seccion('Datos del radicado');
      campo('Número de radicado', registro.radicado);
      campo('Tipo de solicitud', registro.tipoSolicitud);
      campo('Estado actual', registro.estado);
      campo('Remitente', registro.remitente);
      campo('Correo del remitente', registro.correoRemitente || 'No registrado');
      campo('Cargo / Entidad', registro.cargoEntidad || 'No registrado');
      campo('Forma de envío', registro.formaEnvio || 'No registrado');

      seccion('Asunto');
      doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(registro.asunto || 'No registrado', { width: 495 });

      if (registro.observaciones) {
        seccion('Observaciones');
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(registro.observaciones, { width: 495 });
      }

      seccion('Trazabilidad');
      campo('Fecha de recibido', this.formatearFechaPdf(registro.fechaRecibido));
      campo('Fecha límite de respuesta', this.formatearFechaPdf(registro.fechaVencimiento));
      campo('Fecha de contestación', this.formatearFechaPdf(registro.fechaContestacion));

      if (registro.respuestaMensaje) {
        seccion('Respuesta enviada desde el aplicativo');
        campo('Enviada el', this.formatearFechaPdf(registro.respuestaEnviadaEn));
        doc.fillColor(colorMuted).fontSize(9).font('Helvetica-Bold').text('MENSAJE ENVIADO');
        doc.moveDown(0.2);
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(registro.respuestaMensaje, { width: 495 });
        doc.moveDown(0.4);
        if (registro.archivoRespuesta) {
          campo('Archivo de respuesta', registro.archivoRespuesta);
        }
      }

      seccion('Archivo adjunto original');
      campo('Enlace', registro.archivosAnexos || 'Sin archivo adjunto');

      doc.moveDown(2);
      doc.strokeColor(colorBorde).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc
        .fillColor(colorMuted)
        .fontSize(8)
        .font('Helvetica')
        .text(
          'Documento generado automáticamente por el Sistema de Gestión de Correspondencia. ' +
          'Este informe refleja el estado del radicado al momento de su generación.',
          { width: 495 },
        );

      doc.end();
    });
  }

  /** Determina si un radicado se respondió/está dentro del término legal, para el informe de cumplimiento. */
  private calcularCumplimiento(r: Correspondencia): 'A tiempo' | 'Fuera de término' | 'Vencido' | 'En término' | 'N/A' {
    if (!r.fechaVencimiento) return 'N/A';
    const vencimiento = new Date(r.fechaVencimiento);
    if (r.estado === EstadoSolicitud.RESPONDIDO) {
      if (!r.fechaContestacion) return 'N/A';
      return new Date(r.fechaContestacion) <= vencimiento ? 'A tiempo' : 'Fuera de término';
    }
    return new Date() > vencimiento ? 'Vencido' : 'En término';
  }

  /**
   * Genera un informe de gestión/cumplimiento en PDF para un periodo (mes, año o rango),
   * con conteos por tipo, cumplimiento de términos, y el detalle radicado por radicado.
   */
  async generarInformePeriodoPdf(
    desde: string,
    hasta: string,
    tituloPeriodo: string,
    estado?: EstadoSolicitud,
    tipoSolicitud?: TipoSolicitud,
  ): Promise<Buffer> {
    const queryBuilder = this.correspondenciaRepository
      .createQueryBuilder('c')
      .where('c.fechaRecibido BETWEEN :desde AND :hasta', { desde, hasta });

    if (estado) queryBuilder.andWhere('c.estado = :estado', { estado });
    if (tipoSolicitud) queryBuilder.andWhere('c.tipoSolicitud = :tipoSolicitud', { tipoSolicitud });

    const registros = await queryBuilder.orderBy('c.fechaRecibido', 'ASC').getMany();

    const { texto: colorTexto, muted: colorMuted, borde: colorBorde, exito, advertencia, peligro } = this.colores;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const filtrosTexto: string[] = [];
      if (tipoSolicitud) filtrosTexto.push(`Tipo: ${tipoSolicitud}`);
      if (estado) filtrosTexto.push(`Estado: ${estado}`);

      this.dibujarEncabezadoPdf(
        doc,
        'Informe de gestión y cumplimiento',
        tituloPeriodo,
        filtrosTexto.length ? `Filtros aplicados — ${filtrosTexto.join(' · ')}` : undefined,
      );

      // --- Conteos ---
      const porTipo = new Map<string, number>();
      let aTiempo = 0, fueraDeTermino = 0, vencidos = 0, enTermino = 0, sinTermino = 0;

      for (const r of registros) {
        porTipo.set(r.tipoSolicitud, (porTipo.get(r.tipoSolicitud) || 0) + 1);
        const cumplimiento = this.calcularCumplimiento(r);
        if (cumplimiento === 'A tiempo') aTiempo++;
        else if (cumplimiento === 'Fuera de término') fueraDeTermino++;
        else if (cumplimiento === 'Vencido') vencidos++;
        else if (cumplimiento === 'En término') enTermino++;
        else sinTermino++;
      }

      const seccion = (titulo: string) => {
        doc.moveDown(0.4);
        doc.fillColor(colorTexto).fontSize(11).font('Helvetica-Bold').text(titulo);
        doc.strokeColor(colorBorde).lineWidth(0.7).moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.moveDown(0.6);
      };

      seccion('Resumen general');
      doc.fillColor(colorTexto).fontSize(10).font('Helvetica-Bold').text(`Total de radicados en el periodo: ${registros.length}`);
      doc.moveDown(0.5);

      doc.fillColor(colorMuted).fontSize(9).font('Helvetica-Bold').text('POR TIPO DE SOLICITUD');
      doc.moveDown(0.2);
      if (porTipo.size === 0) {
        doc.fillColor(colorMuted).fontSize(10).font('Helvetica').text('No se encontraron radicados en este periodo.');
      }
      for (const [tipo, cantidad] of porTipo.entries()) {
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(`${tipo}: ${cantidad}`);
      }

      doc.moveDown(0.6);
      doc.fillColor(colorMuted).fontSize(9).font('Helvetica-Bold').text('CUMPLIMIENTO DE TÉRMINOS');
      doc.moveDown(0.2);
      doc.fillColor(exito).fontSize(10).font('Helvetica-Bold').text(`Respondidos a tiempo: ${aTiempo}`);
      doc.fillColor(advertencia).fontSize(10).font('Helvetica-Bold').text(`Respondidos fuera de término: ${fueraDeTermino}`);
      doc.fillColor(peligro).fontSize(10).font('Helvetica-Bold').text(`Vencidos sin responder: ${vencidos}`);
      doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(`En trámite, dentro del término: ${enTermino}`);
      doc.fillColor(colorMuted).fontSize(10).font('Helvetica').text(`Sin término legal (sugerencias, invitaciones, etc.): ${sinTermino}`);

      // --- Detalle ---
      if (registros.length > 0) {
        doc.addPage();
        seccion('Detalle de radicados');

        const columnas = [
          { titulo: 'Radicado', ancho: 65 },
          { titulo: 'Tipo', ancho: 80 },
          { titulo: 'Remitente', ancho: 100 },
          { titulo: 'Recibido', ancho: 60 },
          { titulo: 'Vencimiento', ancho: 65 },
          { titulo: 'Estado', ancho: 60 },
          { titulo: 'Cumple', ancho: 65 },
        ];
        const xInicial = 50;
        const altoFila = 20;

        const truncar = (texto: string, maxCaracteres: number) =>
          texto && texto.length > maxCaracteres ? texto.slice(0, maxCaracteres - 1) + '…' : (texto || '');

        const dibujarCabeceraTabla = () => {
          let x = xInicial;
          doc.fillColor('#f8fafc').rect(xInicial, doc.y, 495, altoFila).fill();
          doc.fillColor(colorMuted).fontSize(7.5).font('Helvetica-Bold');
          const y = doc.y + 6;
          for (const col of columnas) {
            doc.text(col.titulo.toUpperCase(), x + 3, y, { width: col.ancho - 6 });
            x += col.ancho;
          }
          doc.y += altoFila;
        };

        dibujarCabeceraTabla();

        const colorCumplimiento = (c: string) =>
          c === 'A tiempo' ? exito : c === 'Vencido' ? peligro : c === 'Fuera de término' ? advertencia : colorMuted;

        for (const r of registros) {
          if (doc.y + altoFila > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            dibujarCabeceraTabla();
          }

          const cumplimiento = this.calcularCumplimiento(r);
          const y = doc.y + 5;
          let x = xInicial;

          const valores = [
            truncar(r.radicado, 14),
            truncar(r.tipoSolicitud, 16),
            truncar(r.remitente, 20),
            r.fechaRecibido ? new Date(r.fechaRecibido).toLocaleDateString('es-CO') : '—',
            r.fechaVencimiento ? new Date(r.fechaVencimiento).toLocaleDateString('es-CO') : '—',
            truncar(r.estado, 12),
            cumplimiento,
          ];

          doc.fontSize(7.5).font('Helvetica');
          valores.forEach((valor, i) => {
            doc.fillColor(i === 6 ? colorCumplimiento(cumplimiento) : colorTexto);
            doc.text(valor, x + 3, y, { width: columnas[i].ancho - 6 });
            x += columnas[i].ancho;
          });

          doc.strokeColor(colorBorde).lineWidth(0.5).moveTo(xInicial, doc.y + altoFila - 3).lineTo(545, doc.y + altoFila - 3).stroke();
          doc.y += altoFila;
        }
      }

      doc.moveDown(1.5);
      doc.strokeColor(colorBorde).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc
        .fillColor(colorMuted)
        .fontSize(8)
        .font('Helvetica')
        .text(
          'Documento generado automáticamente por el Sistema de Gestión de Correspondencia. ' +
          'El cumplimiento de términos se calcula con base en el plazo legal de respuesta de cada tipo de solicitud.',
          { width: 495 },
        );

      doc.end();
    });
  }
}