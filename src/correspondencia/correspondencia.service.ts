// src/correspondencia/correspondencia.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Correspondencia,
  TipoSolicitud,
} from './entities/correspondencia.entity';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';

@Injectable()
export class CorrespondenciaService {
  constructor(
    @InjectRepository(Correspondencia)
    private correspondenciaRepository: Repository<Correspondencia>,
  ) {}

  async create(
    createCorrespondenciaDto: CreateCorrespondenciaDto,
  ): Promise<Correspondencia> {
    const nuevaCorrespondencia = this.correspondenciaRepository.create(
      createCorrespondenciaDto,
    );

    nuevaCorrespondencia.fechaVencimiento = this.calcularFechaVencimiento(
      new Date(),
      nuevaCorrespondencia.tipoSolicitud,
    );

  return this.correspondenciaRepository.save(nuevaCorrespondencia);
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
}