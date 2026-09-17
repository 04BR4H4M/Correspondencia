// src/configuracion/entities/configuracion.entity.ts
import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('configuracion')
export class Configuracion {
  // Fila única: siempre id = 1
  @PrimaryColumn({ default: 1 })
  id: number;

  // --- Perfil del administrador ---
  @Column({ type: 'varchar', length: 150, nullable: true })
  nombreAdministrador: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fotoPerfil: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fotoPerfilId: string | null; // ID en Drive, para poder reemplazarla/borrarla

  // --- Correo remitente (para respuestas y notificaciones) ---
  @Column({ type: 'varchar', length: 150, nullable: true })
  nombreRemitente: string | null; // Ej: "Concejo Municipal de Nilo"

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpHost: string | null;

  @Column({ type: 'int', nullable: true })
  smtpPort: number | null;

  @Column({ type: 'boolean', default: true })
  smtpSecure: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpUser: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  smtpPass: string | null; // select:false -> nunca se devuelve por defecto en consultas normales

  // --- Conexión con Gmail (para leer la bandeja y sugerir radicados) ---
  @Column({ type: 'boolean', default: false })
  gmailConectado: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gmailCorreoConectado: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, select: false })
  gmailRefreshToken: string | null; // select:false -> nunca se devuelve por defecto

  @Column({ type: 'datetime', nullable: true })
  gmailUltimoEscaneo: Date | null;
}