// src/solicitudes-gmail/solicitudes-gmail.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { google } from 'googleapis';

import { SolicitudSugerida, EstadoSugerida } from './entities/solicitud-sugerida.entity';
import { TipoSolicitud } from '../correspondencia/entities/correspondencia.entity';
import { ConfiguracionService } from '../configuracion/configuracion.service';

const SCOPES_GMAIL = ['https://www.googleapis.com/auth/gmail.readonly'];

@Injectable()
export class SolicitudesGmailService {
  constructor(
    @InjectRepository(SolicitudSugerida)
    private readonly repo: Repository<SolicitudSugerida>,
    private readonly configService: ConfigService,
    private readonly configuracionService: ConfiguracionService,
  ) {}

  private crearOAuthClient() {
    return new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_GMAIL_CALLBACK_URL'),
    );
  }

  /** URL a la que se redirige al administrador para autorizar la lectura de la bandeja. */
  generarUrlConexion(): string {
    const client = this.crearOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // fuerza a que Google SIEMPRE devuelva un refresh_token
      scope: SCOPES_GMAIL,
    });
  }

  /** Intercambia el código de autorización por tokens y guarda la conexión. */
  async procesarCallback(code: string): Promise<{ correo: string }> {
    const client = this.crearOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google no devolvió un token de actualización. Ve a myaccount.google.com/permissions, ' +
        'quita el acceso ya otorgado a esta app, y vuelve a intentar conectar Gmail.',
      );
    }

    client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const perfil = await gmail.users.getProfile({ userId: 'me' });
    const correo = perfil.data.emailAddress || 'desconocido';

    await this.configuracionService.guardarConexionGmail(correo, tokens.refresh_token);
    return { correo };
  }

  async desconectar() {
    await this.configuracionService.desconectarGmail();
  }

  private async obtenerClienteAutenticado() {
    const refreshToken = await this.configuracionService.obtenerRefreshTokenGmail();
    if (!refreshToken) {
      throw new BadRequestException('Gmail no está conectado. Conéctalo primero desde Perfil y correo.');
    }
    const client = this.crearOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    return google.gmail({ version: 'v1', auth: client });
  }

  private extraerHeader(headers: { name?: string | null; value?: string | null }[] | undefined, nombre: string): string {
    const header = (headers || []).find((h) => h.name?.toLowerCase() === nombre.toLowerCase());
    return header?.value || '';
  }

  private parsearRemitente(fromHeader: string): { nombre: string | null; correo: string | null } {
    const match = fromHeader.match(/^"?([^"<]*)"?\s*<?([^\s<>]+@[^\s<>]+)>?$/);
    if (!match) return { nombre: null, correo: null };
    const nombre = match[1]?.trim().replace(/^"|"$/g, '') || null;
    const correo = match[2]?.trim() || null;
    return { nombre: nombre || correo, correo };
  }

  private decodificarBase64Url(data: string): string {
    const normalizado = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalizado, 'base64').toString('utf8');
  }

  private extraerCuerpoPlano(payload: any, snippet: string): string {
    const buscarParte = (parte: any, mimeType: string): any => {
      if (!parte) return null;
      if (parte.mimeType === mimeType && parte.body?.data) return parte;
      for (const sub of parte.parts || []) {
        const encontrada = buscarParte(sub, mimeType);
        if (encontrada) return encontrada;
      }
      return null;
    };

    const partePlano = buscarParte(payload, 'text/plain');
    if (partePlano) return this.decodificarBase64Url(partePlano.body.data);

    const parteHtml = buscarParte(payload, 'text/html');
    if (parteHtml) {
      const html = this.decodificarBase64Url(parteHtml.body.data);
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return snippet || '';
  }

  /** Clasifica el texto del correo. Devuelve null si no parece una PQRSD (y por lo tanto no es candidato). */
  private clasificar(texto: string): TipoSolicitud | null {
    const t = texto.toLowerCase();
    if (/derecho de petici[oó]n/.test(t)) return TipoSolicitud.DERECHO_PETICION;
    if (/queja/.test(t)) return TipoSolicitud.QUEJA;
    if (/reclamo/.test(t)) return TipoSolicitud.RECLAMO;
    if (/sugerencia/.test(t)) return TipoSolicitud.SUGERENCIA;
    if (/invitaci[oó]n/.test(t)) return TipoSolicitud.INVITACION;
    if (/petici[oó]n|solicitud|tr[aá]mite|pqrsd/.test(t)) return TipoSolicitud.DERECHO_PETICION;
    return null;
  }

  /** Escanea la bandeja de los últimos 7 días buscando correos candidatos a PQRSD. */
  async escanear(): Promise<{ nuevas: number; revisadas: number }> {
    const gmail = await this.obtenerClienteAutenticado();

    const listado = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:7d in:inbox',
      maxResults: 50,
    });

    const ids = (listado.data.messages || []).map((m) => m.id).filter((id): id is string => !!id);
    if (ids.length === 0) {
      await this.configuracionService.registrarEscaneoGmail();
      return { nuevas: 0, revisadas: 0 };
    }

    const existentes = await this.repo.find({
      where: { gmailMessageId: In(ids) },
      select: ['gmailMessageId'],
    });
    const idsExistentes = new Set(existentes.map((e) => e.gmailMessageId));
    const idsNuevos = ids.filter((id) => !idsExistentes.has(id));

    let nuevasPendientes = 0;

    for (const id of idsNuevos) {
      const mensaje = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const headers = mensaje.data.payload?.headers;

      const from = this.extraerHeader(headers, 'From');
      const subject = this.extraerHeader(headers, 'Subject');
      const dateHeader = this.extraerHeader(headers, 'Date');
      const { nombre, correo } = this.parsearRemitente(from);
      const cuerpo = this.extraerCuerpoPlano(mensaje.data.payload, mensaje.data.snippet || '');

      const tipoSugerido = this.clasificar(`${subject} ${cuerpo}`);
      const esCandidato = tipoSugerido !== null;

      const solicitud = this.repo.create({
        gmailMessageId: id,
        remitente: nombre,
        correoRemitente: correo,
        asunto: subject || '(sin asunto)',
        cuerpo: cuerpo.slice(0, 50000), // límite de seguridad, no un recorte real (mediumtext soporta hasta 16MB)
        tipoSugerido: tipoSugerido || undefined,
        fechaCorreo: dateHeader ? new Date(dateHeader) : new Date(),
        estado: esCandidato ? EstadoSugerida.PENDIENTE : EstadoSugerida.DESCARTADA,
      });

      await this.repo.save(solicitud);
      if (esCandidato) nuevasPendientes++;
    }

    await this.configuracionService.registrarEscaneoGmail();
    return { nuevas: nuevasPendientes, revisadas: idsNuevos.length };
  }

  async listar(estado: EstadoSugerida = EstadoSugerida.PENDIENTE) {
    return this.repo.find({ where: { estado }, order: { fechaCorreo: 'DESC' } });
  }

  async contarPendientes(): Promise<number> {
    return this.repo.count({ where: { estado: EstadoSugerida.PENDIENTE } });
  }

  async marcarProcesada(id: number) {
    await this.repo.update(id, { estado: EstadoSugerida.PROCESADA });
  }

  async marcarDescartada(id: number) {
    await this.repo.update(id, { estado: EstadoSugerida.DESCARTADA });
  }

  /** Escaneo automático cada 3 horas, en horario laboral aproximado. */
  @Cron('0 8-18/3 * * 1-6')
  async escaneoAutomatico() {
    try {
      const estado = await this.configuracionService.obtenerEstadoGmail();
      if (!estado.conectado) return;
      console.log('Ejecutando escaneo automático de Gmail...');
      const resultado = await this.escanear();
      console.log(`Escaneo de Gmail completo: ${resultado.nuevas} nuevas, ${resultado.revisadas} revisadas.`);
    } catch (error) {
      console.error('Error en el escaneo automático de Gmail:', error);
    }
  }
}