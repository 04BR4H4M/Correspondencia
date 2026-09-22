import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

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
    primario: '#1B4B8C',
    primarioOscuro: '#12335F',
    borde: '#e2e8f0',
    fondoSuave: '#f8fafc',
    exito: '#16A34A',
    exitoFondo: '#E7F7ED',
    exitoTexto: '#15803d',
    advertencia: '#F5A623',
    advertenciaFondo: '#FEF6E4',
    advertenciaTexto: '#B45309',
    peligro: '#EF4444',
    peligroFondo: '#FDECEC',
    peligroTexto: '#B91C1C',
    info: '#2563EB',
    infoFondo: '#EAF2FD',
    grisFondo: '#F1F5F9',
    grisTexto: '#64748b',
  };

  /** Convierte un color hex '#rrggbb' a su componente RGB, para poder oscurecer/aclarar. */
  private hexARgb(hex: string): [number, number, number] {
    const limpio = hex.replace('#', '');
    return [
      parseInt(limpio.substring(0, 2), 16),
      parseInt(limpio.substring(2, 4), 16),
      parseInt(limpio.substring(4, 6), 16),
    ];
  }

  /** Dibuja una "pastilla" (badge) de estado con fondo claro y texto de color, centrada verticalmente en (x, y). */
  private dibujarPildora(
    doc: PDFKit.PDFDocument,
    texto: string,
    x: number,
    y: number,
    colorFondo: string,
    colorTexto: string,
    anchoMin = 0,
  ) {
    doc.fontSize(8).font('Helvetica-Bold');
    const anchoTexto = doc.widthOfString(texto);
    const paddingH = 8;
    const ancho = Math.max(anchoTexto + paddingH * 2, anchoMin);
    const alto = 16;

    doc.roundedRect(x, y, ancho, alto, alto / 2).fill(colorFondo);
    doc
      .fillColor(colorTexto)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(texto, x, y + 4.5, { width: ancho, align: 'center' });

    return ancho;
  }

  /** Dibuja el escudo/placeholder institucional. Si en el futuro se cuenta con el PNG oficial, reemplazar por doc.image(). */
  private dibujarLogoPdf(doc: PDFKit.PDFDocument, x: number, y: number, tamano: number) {
    doc.save();
    doc.roundedRect(x, y, tamano, tamano, 8).clip();
    doc.rect(x, y, tamano, tamano / 2).fill('#F5C242');
    doc.rect(x, y + tamano / 2, tamano, tamano / 2).fill('#2E7D46');
    doc.restore();
    doc
      .roundedRect(x, y, tamano, tamano, 8)
      .lineWidth(1.5)
      .strokeColor(this.colores.primarioOscuro)
      .stroke();
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(tamano * 0.24)
      .text('NILO', x, y + tamano / 2 - tamano * 0.12, { width: tamano, align: 'center' });
  }

  /** Encabezado institucional: logo, títulos, fecha de generación, y banda de título del informe. */
  private dibujarEncabezadoPdf(doc: PDFKit.PDFDocument, tituloInforme: string, subtituloInforme?: string) {
    const fecha = this.formatearFechaPdf(new Date());
    const margenX = 50;
    const anchoContenido = 495;

    this.dibujarLogoPdf(doc, margenX, 40, 62);

    doc
      .fillColor(this.colores.primario)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('CONCEJO MUNICIPAL DE NILO', margenX + 78, 44, { width: 280, lineBreak: false });

    doc
      .fillColor(this.colores.primario)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Cundinamarca', margenX + 78, 64, { width: 280, lineBreak: false });

    doc
      .fillColor(this.colores.muted)
      .font('Helvetica')
      .fontSize(9.5)
      .text('Sistema de Gestión de Correspondencia', margenX + 78, 82, { width: 280, lineBreak: false });

    doc
      .strokeColor(this.colores.borde)
      .lineWidth(1)
      .moveTo(400, 48)
      .lineTo(400, 95)
      .stroke();

    doc
      .fillColor(this.colores.muted)
      .font('Helvetica')
      .fontSize(9)
      .text(`Generado: ${fecha}`, 412, 68, { width: 133, align: 'right' });

    // Banda de título
    const bandaY = 112;
    const bandaAlto = subtituloInforme ? 56 : 42;
    doc.roundedRect(margenX, bandaY, anchoContenido, bandaAlto, 6).fill(this.colores.primario);

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(tituloInforme.toUpperCase(), margenX, bandaY + (subtituloInforme ? 12 : 13), {
        width: anchoContenido,
        align: 'center',
      });

    if (subtituloInforme) {
      doc
        .fillColor('#DCE6F5')
        .font('Helvetica')
        .fontSize(10)
        .text(subtituloInforme, margenX, bandaY + 34, { width: anchoContenido, align: 'center' });
    }

    doc.x = margenX;
    doc.y = bandaY + bandaAlto + 22;
  }

  /** Título de una sección principal del cuerpo del informe (p. ej. "Resumen ejecutivo"). */
  private dibujarTituloSeccion(doc: PDFKit.PDFDocument, texto: string) {
    doc.x = 50;
    doc
      .fillColor(this.colores.texto)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(texto, 50, doc.y, { width: 495 });
    doc.x = 50;
    doc.moveDown(0.6);
  }

  /** Encabezado de sección secundaria con ícono simple + fondo suave (p. ej. "Detalle de radicados"). */
  private dibujarEncabezadoSubseccion(doc: PDFKit.PDFDocument, texto: string) {
    doc.x = 50;
    const y = doc.y;
    const alto = 34;
    doc.roundedRect(50, y, 495, alto, 6).fill(this.colores.infoFondo);

    // Ícono de documento simplificado
    const iconX = 66;
    const iconY = y + 9;
    doc.roundedRect(iconX, iconY, 13, 16, 2).fill(this.colores.info);
    doc.rect(iconX + 2.5, iconY + 4, 8, 1.2).fill('#ffffff');
    doc.rect(iconX + 2.5, iconY + 7, 8, 1.2).fill('#ffffff');
    doc.rect(iconX + 2.5, iconY + 10, 5, 1.2).fill('#ffffff');

    doc
      .fillColor(this.colores.primario)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(texto, 90, y + 9, { width: 440 });

    doc.x = 50;
    doc.y = y + alto + 14;
  }

  /** Dibuja una tarjeta KPI con ícono circular de color, número grande, y etiqueta. */
  private dibujarTarjetaKpi(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    etiqueta: string,
    valor: number,
    colorFondo: string,
    colorIcono: string,
    tipoIcono: 'total' | 'check' | 'reloj' | 'x',
  ) {
    doc.roundedRect(x, y, ancho, alto, 8).fill(colorFondo);

    const centroX = x + ancho / 2;
    const iconoY = y + 16;
    const radioIcono = 18;

    doc.circle(centroX, iconoY + radioIcono, radioIcono).fill(colorIcono);

    doc.save();
    doc.strokeColor('#ffffff').lineWidth(2.4).lineCap('round').lineJoin('round');
    const cx = centroX;
    const cy = iconoY + radioIcono;

    if (tipoIcono === 'total') {
      doc.roundedRect(cx - 7, cy - 8, 14, 17, 2).stroke();
      doc.moveTo(cx - 3.5, cy - 8).lineTo(cx - 3.5, cy - 10.5).lineTo(cx + 3.5, cy - 10.5).lineTo(cx + 3.5, cy - 8).stroke();
      doc.moveTo(cx - 4, cy - 2).lineTo(cx + 4, cy - 2).stroke();
      doc.moveTo(cx - 4, cy + 2).lineTo(cx + 4, cy + 2).stroke();
    } else if (tipoIcono === 'check') {
      doc.moveTo(cx - 7, cy).lineTo(cx - 2, cy + 6).lineTo(cx + 8, cy - 7).stroke();
    } else if (tipoIcono === 'reloj') {
      doc.circle(cx, cy, 9).stroke();
      doc.moveTo(cx, cy).lineTo(cx, cy - 6).stroke();
      doc.moveTo(cx, cy).lineTo(cx + 5, cy + 2).stroke();
    } else if (tipoIcono === 'x') {
      doc.moveTo(cx - 6, cy - 6).lineTo(cx + 6, cy + 6).stroke();
      doc.moveTo(cx + 6, cy - 6).lineTo(cx - 6, cy + 6).stroke();
    }
    doc.restore();

    doc
      .fillColor(colorIcono)
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(String(valor), x, iconoY + radioIcono * 2 + 8, { width: ancho, align: 'center' });

    doc
      .fillColor(this.colores.muted)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(etiqueta.toUpperCase(), x, y + alto - 20, { width: ancho, align: 'center' });
  }

  /**
   * Dibuja un gráfico de torta/dona simple a partir de una lista de segmentos {etiqueta, valor, color},
   * junto con su leyenda, dentro de una tarjeta con borde.
   */
  private dibujarGraficoTorta(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    titulo: string,
    segmentos: { etiqueta: string; valor: number; color: string }[],
  ) {
    doc.roundedRect(x, y, ancho, alto, 8).lineWidth(1).strokeColor(this.colores.borde).stroke();

    doc
      .fillColor(this.colores.primario)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(titulo.toUpperCase(), x + 16, y + 14, { width: ancho - 32 });

    const total = segmentos.reduce((acc, s) => acc + s.valor, 0);
    const radio = Math.min(alto - 70, 60) / 2 + 30;
    const cx = x + 30 + radio;
    const cy = y + alto / 2 + 8;

    if (total === 0) {
      doc.circle(cx, cy, radio).fill(this.colores.grisFondo);
    } else {
      let anguloInicial = -90;
      for (const seg of segmentos) {
        const anguloBarrido = (seg.valor / total) * 360;
        if (anguloBarrido <= 0) continue;

        if (anguloBarrido >= 359.9) {
          doc.circle(cx, cy, radio).fill(seg.color);
        } else {
          doc.save();
          doc.moveTo(cx, cy);
          const pasos = Math.max(2, Math.ceil(anguloBarrido / 3));
          for (let i = 0; i <= pasos; i++) {
            const a = ((anguloInicial + (anguloBarrido * i) / pasos) * Math.PI) / 180;
            doc.lineTo(cx + radio * Math.cos(a), cy + radio * Math.sin(a));
          }
          doc.closePath().fill(seg.color);
          doc.restore();
        }
        anguloInicial += anguloBarrido;
      }
    }

    // Círculo interior blanco → efecto dona + porcentaje del segmento mayor al centro
    const radioInterior = radio * 0.55;
    doc.circle(cx, cy, radioInterior).fill('#ffffff');
    const mayor = segmentos.reduce((a, b) => (b.valor > a.valor ? b : a), { etiqueta: '', valor: 0, color: '' });
    const pctMayor = total > 0 ? ((mayor.valor / total) * 100).toFixed(0) : '0';
    doc
      .fillColor(this.colores.texto)
      .font('Helvetica-Bold')
      .fontSize(radioInterior > 20 ? 15 : 11)
      .text(`${pctMayor}%`, cx - radioInterior, cy - 7, { width: radioInterior * 2, align: 'center' });

    // Leyenda a la derecha del círculo
    const leyendaX = cx + radio + 24;
    const leyendaAncho = x + ancho - 16 - leyendaX;
    let leyendaY = y + alto / 2 - (segmentos.length * 30) / 2;

    for (const seg of segmentos) {
      const pct = total > 0 ? ((seg.valor / total) * 100).toFixed(1) : '0.0';
      doc.circle(leyendaX + 5, leyendaY + 6, 5).fill(seg.color);
      doc
        .fillColor(this.colores.texto)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(`${seg.etiqueta}:`, leyendaX + 16, leyendaY, { width: leyendaAncho - 16 });
      doc
        .fillColor(this.colores.muted)
        .font('Helvetica')
        .fontSize(9)
        .text(`${seg.valor} radicados (${pct}%)`, leyendaX + 16, leyendaY + 13, { width: leyendaAncho - 16 });
      leyendaY += 32;
    }

    doc.x = 50;
    doc.y = y + alto + 20;
  }

  /** Dibuja la tarjeta "Cumplimiento de términos": lista de filas con una pastilla de % + etiqueta + conteo. */
  private dibujarTarjetaCumplimiento(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    filas: { etiqueta: string; cantidad: number; color: string; colorTexto: string }[],
    total: number,
  ) {
    doc.roundedRect(x, y, ancho, alto, 8).lineWidth(1).strokeColor(this.colores.borde).stroke();

    doc
      .fillColor(this.colores.primario)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('CUMPLIMIENTO DE TÉRMINOS', x + 16, y + 14, { width: ancho - 32 });

    let filaY = y + 40;
    const altoFila = (alto - 48) / filas.length;

    for (const fila of filas) {
      const pct = total > 0 ? ((fila.cantidad / total) * 100).toFixed(1) : '0.0';
      this.dibujarPildora(doc, `${pct}%`, x + 16, filaY, fila.color, fila.colorTexto, 52);

      doc
        .fillColor(this.colores.texto)
        .font('Helvetica')
        .fontSize(9.5)
        .text(fila.etiqueta + ':', x + 80, filaY + 4, { width: ancho - 160, continued: true })
        .font('Helvetica-Bold')
        .text(` ${fila.cantidad}`);

      filaY += altoFila;
    }

    doc.x = 50;
    doc.y = y + alto + 20;
  }

  /** Pie de página institucional (banda navy con nombre del sistema y "Página X de Y"), dibujado sobre todas las páginas al final. */
  private dibujarPiesDePagina(doc: PDFKit.PDFDocument) {
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      const alto = 32;
      const y = doc.page.height - alto;

      // El pie va DENTRO del margen inferior de la página a propósito. Sin este ajuste,
      // PDFKit detecta que el texto cae más allá del margen "imprimible" y agrega
      // automáticamente una página en blanco extra antes de dibujarlo.
      const margenInferiorOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.rect(0, y, doc.page.width, alto).fill(this.colores.primario);

      doc
        .fillColor('#ffffff')
        .font('Helvetica')
        .fontSize(8.5)
        .text('Concejo Municipal de Nilo - Sistema de Gestión de Correspondencia', 20, y + 11, {
          width: 350,
          lineBreak: false,
        });

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(`Página ${i - rango.start + 1} de ${rango.count}`, doc.page.width - 170, y + 11, {
          width: 150,
          align: 'right',
          lineBreak: false,
        });

      doc.page.margins.bottom = margenInferiorOriginal;
    }
  }

  /**
   * Genera la ficha/informe de trazabilidad de un radicado en PDF,
   * para usar como soporte documental (adjuntar a una solicitud, demanda, etc.).
   */
  async generarInformePdf(id: number): Promise<Buffer> {
    const registro = await this.findOne(id);
    const { texto: colorTexto, muted: colorMuted, borde: colorBorde } = this.colores;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.dibujarEncabezadoPdf(doc, 'Informe de trazabilidad', `Radicado ${registro.radicado}`);

      const campo = (etiqueta: string, valor: string) => {
        const y = doc.y;
        doc.fillColor(colorMuted).fontSize(9).font('Helvetica-Bold').text(etiqueta.toUpperCase(), 50, y, { width: 160 });
        const alturaValor = doc.heightOfString(valor || 'No registrado', { width: 325 });
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(valor || 'No registrado', 220, y, { width: 325 });
        doc.x = 50;
        doc.y = y + Math.max(alturaValor, 12) + 6;
      };

      const seccion = (titulo: string) => {
        doc.x = 50;
        doc.moveDown(0.3);
        doc.fillColor(colorTexto).fontSize(11).font('Helvetica-Bold').text(titulo, 50, doc.y);
        doc.strokeColor(colorBorde).lineWidth(0.7).moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.x = 50;
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
      doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(registro.asunto || 'No registrado', 50, doc.y, { width: 495 });

      if (registro.observaciones) {
        seccion('Observaciones');
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(registro.observaciones, 50, doc.y, { width: 495 });
      }

      seccion('Trazabilidad');
      campo('Fecha de recibido', this.formatearFechaPdf(registro.fechaRecibido));
      campo('Fecha límite de respuesta', this.formatearFechaPdf(registro.fechaVencimiento));
      campo('Fecha de contestación', this.formatearFechaPdf(registro.fechaContestacion));

      if (registro.respuestaMensaje) {
        seccion('Respuesta enviada desde el aplicativo');
        campo('Enviada el', this.formatearFechaPdf(registro.respuestaEnviadaEn));
        doc.x = 50;
        doc.fillColor(colorMuted).fontSize(9).font('Helvetica-Bold').text('MENSAJE ENVIADO', 50, doc.y);
        doc.x = 50;
        doc.moveDown(0.2);
        doc.fillColor(colorTexto).fontSize(10).font('Helvetica').text(registro.respuestaMensaje, 50, doc.y, { width: 495 });
        doc.x = 50;
        doc.moveDown(0.4);
        if (registro.archivoRespuesta) {
          campo('Archivo de respuesta', registro.archivoRespuesta);
        }
      }

      seccion('Archivo adjunto original');
      campo('Enlace', registro.archivosAnexos || 'Sin archivo adjunto');

      this.dibujarPiesDePagina(doc);
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
   * con tarjetas KPI, gráfico de distribución por tipo, semáforo de cumplimiento y detalle radicado por radicado.
   */
  async generarInformePeriodoExcel(
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

    const AZUL_INSTITUCIONAL = 'FF1B4B8C';
    const GRIS_CLARO = 'FFF8FAFC';
    const VERDE = 'FFE7F7ED';
    const AMBAR = 'FFFEF6E4';
    const ROJO = 'FFFDECEC';
    const BLANCO = 'FFFFFFFF';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Gestión de Correspondencia';
    workbook.created = new Date();

    // ================= HOJA 1: RESUMEN =================
    const resumen = workbook.addWorksheet('Resumen');
    resumen.columns = [{ width: 36 }, { width: 18 }];

    const filaTitulo = resumen.addRow(['Concejo Municipal de Nilo']);
    filaTitulo.getCell(1).font = { bold: true, size: 14, color: { argb: AZUL_INSTITUCIONAL } };
    resumen.addRow(['Sistema de Gestión de Correspondencia · Cundinamarca']).getCell(1).font = { size: 9, color: { argb: 'FF64748B' } };
    resumen.addRow([]);

    const filaPeriodo = resumen.addRow([`Informe de gestión — ${tituloPeriodo}`]);
    filaPeriodo.getCell(1).font = { bold: true, size: 12, color: { argb: AZUL_INSTITUCIONAL } };

    const filtrosTexto: string[] = [];
    if (tipoSolicitud) filtrosTexto.push(`Tipo: ${tipoSolicitud}`);
    if (estado) filtrosTexto.push(`Estado: ${estado}`);
    if (filtrosTexto.length) {
      resumen.addRow([`Filtros aplicados — ${filtrosTexto.join(' · ')}`]).getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    }
    resumen.addRow([`Generado el ${this.formatearFechaPdf(new Date())}`]).getCell(1).font = { size: 9, color: { argb: 'FF64748B' } };
    resumen.addRow([]);

    const filaTotal = resumen.addRow(['Total de radicados en el periodo', registros.length]);
    filaTotal.font = { bold: true, size: 11 };
    resumen.addRow([]);

    resumen.addRow(['Por tipo de solicitud']).getCell(1).font = { bold: true, size: 11 };
    const encabezadoTipo = resumen.addRow(['Tipo', 'Cantidad']);
    encabezadoTipo.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: BLANCO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_INSTITUCIONAL } };
    });
    if (porTipo.size === 0) {
      resumen.addRow(['No se encontraron radicados en este periodo.', '']);
    }
    for (const [tipo, cantidad] of porTipo.entries()) {
      resumen.addRow([tipo, cantidad]);
    }
    resumen.addRow([]);

    resumen.addRow(['Cumplimiento de términos']).getCell(1).font = { bold: true, size: 11 };
    const encabezadoCump = resumen.addRow(['Categoría', 'Cantidad']);
    encabezadoCump.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: BLANCO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_INSTITUCIONAL } };
    });

    const filasCumplimiento: [string, number, string][] = [
      ['Respondidos a tiempo', aTiempo, VERDE],
      ['Respondidos fuera de término', fueraDeTermino, AMBAR],
      ['Vencidos sin responder', vencidos, ROJO],
      ['En trámite, dentro del término', enTermino, BLANCO],
      ['Sin término legal (sugerencias, invitaciones, etc.)', sinTermino, GRIS_CLARO],
    ];
    for (const [etiqueta, cantidad, color] of filasCumplimiento) {
      const fila = resumen.addRow([etiqueta, cantidad]);
      fila.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      });
    }

    // ================= HOJA 2: DETALLE =================
    const detalle = workbook.addWorksheet('Detalle');
    detalle.columns = [
      { header: 'Radicado', key: 'radicado', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 20 },
      { header: 'Remitente', key: 'remitente', width: 28 },
      { header: 'Correo', key: 'correo', width: 28 },
      { header: 'Fecha recibido', key: 'recibido', width: 16 },
      { header: 'Fecha vencimiento', key: 'vencimiento', width: 16 },
      { header: 'Fecha contestación', key: 'contestacion', width: 18 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Cumplimiento', key: 'cumplimiento', width: 20 },
      { header: 'Asunto', key: 'asunto', width: 45 },
    ];

    detalle.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: BLANCO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_INSTITUCIONAL } };
    });
    detalle.views = [{ state: 'frozen', ySplit: 1 }];
    detalle.autoFilter = { from: 'A1', to: 'J1' };

    const colorCumplimiento = (c: string) =>
      c === 'A tiempo' ? VERDE : c === 'Vencido' ? ROJO : c === 'Fuera de término' ? AMBAR : c === 'En término' ? BLANCO : GRIS_CLARO;

    for (const r of registros) {
      const cumplimiento = this.calcularCumplimiento(r);
      const fila = detalle.addRow({
        radicado: r.radicado,
        tipo: r.tipoSolicitud,
        remitente: r.remitente,
        correo: r.correoRemitente || '',
        recibido: r.fechaRecibido ? new Date(r.fechaRecibido).toLocaleDateString('es-CO') : '',
        vencimiento: r.fechaVencimiento ? new Date(r.fechaVencimiento).toLocaleDateString('es-CO') : '',
        contestacion: r.fechaContestacion ? new Date(r.fechaContestacion).toLocaleDateString('es-CO') : '',
        estado: r.estado,
        cumplimiento,
        asunto: r.asunto,
      });
      fila.getCell('cumplimiento').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorCumplimiento(cumplimiento) } };
      fila.getCell('cumplimiento').font = { bold: true };
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}