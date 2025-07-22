// src/correspondencia/entities/correspondencia.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum TipoSolicitud {
    DERECHO_PETICION = 'Derecho de Petición',
    QUEJA = 'Queja',
    RECLAMO = 'Reclamo',
    SUGERENCIA = 'Sugerencia',
    INVITACION = 'Invitación',
    OTRO = 'Otro',
}

export enum EstadoSolicitud {
    RECIBIDO = 'Recibido',
    EN_PROCESO = 'En Proceso',
    RESPONDIDO = 'Respondido',
}

@Entity({ name: 'correspondencia' })
export class Correspondencia {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: false })
    radicado: string;

@Column({ type: 'date', name: 'fecha_recibido' })
fechaRecibido: Date;
    @Column({ type: 'varchar', length: 255, nullable: false })
    remitente: string;

    @Column({ type: 'text' })
    asunto: string;

    @Column({ type: 'enum', enum: TipoSolicitud, nullable: false })
    tipoSolicitud: TipoSolicitud;

    @Column({ type: 'date', nullable: true })
fechaVencimiento: Date | null;
    @Column({ type: 'enum', enum: EstadoSolicitud, default: EstadoSolicitud.RECIBIDO })
    estado: EstadoSolicitud;
}