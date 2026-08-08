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
export enum FormaEnvio {
    FISICO = 'Físico',
    CORREO = 'Correo',
    PAGINA = 'Página',
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
    // ... dentro de la clase Correspondencia

@Column({ type: 'date', nullable: true }) // Nueva columna
fechaContestacion: Date | null;

@Column({ type: 'varchar', length: 255, nullable: true }) // Nueva columna
cargoEntidad: string;

@Column({ type: 'varchar', length: 255, nullable: true }) // Nueva columna
archivosAnexos: string | null; // Guardaremos la ruta o nombre del archivo aquí

@Column({ type: 'varchar', length: 255, nullable: true })
archivoAnexoId: string | null; // ID del archivo en Google Drive, necesario para poder eliminarlo

@Column({ type: 'varchar', length: 50, nullable: true }) // Nueva columna
formaEnvio: string;

@Column({ type: 'text', nullable: true }) // Nueva columna
observaciones: string;

@Column({ type: 'varchar', length: 255, nullable: true }) // Nueva columna
correoRemitente: string;

// --- Trazabilidad de la respuesta enviada desde el aplicativo ---
@Column({ type: 'text', nullable: true })
respuestaMensaje: string;

@Column({ type: 'datetime', nullable: true })
respuestaEnviadaEn: Date | null;

@Column({ type: 'varchar', length: 255, nullable: true })
archivoRespuesta: string | null;

@Column({ type: 'varchar', length: 255, nullable: true })
archivoRespuestaId: string | null;

}