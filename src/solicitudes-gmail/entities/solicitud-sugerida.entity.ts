// src/solicitudes-gmail/entities/solicitud-sugerida.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { TipoSolicitud } from '../../correspondencia/entities/correspondencia.entity';

export enum EstadoSugerida {
  PENDIENTE = 'Pendiente',
  PROCESADA = 'Procesada',
  DESCARTADA = 'Descartada',
}

@Entity('solicitud_sugerida')
export class SolicitudSugerida {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  gmailMessageId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remitente: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  correoRemitente: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  asunto: string | null;

  @Column({ type: 'mediumtext', nullable: true })
  cuerpo: string | null;

  @Column({ type: 'enum', enum: TipoSolicitud, nullable: true })
  tipoSugerido: TipoSolicitud | null;

  @Column({ type: 'datetime', nullable: true })
  fechaCorreo: Date | null;

  @Column({ type: 'enum', enum: EstadoSugerida, default: EstadoSugerida.PENDIENTE })
  estado: EstadoSugerida;

  @CreateDateColumn()
  creadoEn: Date;
}