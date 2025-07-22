// src/correspondencia/correspondencia.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Correspondencia,
  TipoSolicitud,
} from './entities/correspondencia.entity';
import { CreateCorrespondenciaDto } from './dto/create-correspondencia.dto';
import { NotFoundException } from '@nestjs/common'; // Asegúrate de añadir NotFoundException
import { UpdateCorrespondenciaDto } from './dto/update-correspondencia.dto'; // Añade esta importación


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

async findOne(id: number): Promise<Correspondencia> {
  const registro = await this.correspondenciaRepository.findOneBy({ id });
  if (!registro) {
    throw new NotFoundException(`El registro con el id ${id} no fue encontrado.`);
  }
  return registro;
}
/**
 * Elimina un registro de correspondencia por su ID.
 */
async remove(id: number): Promise<void> {
  const result = await this.correspondenciaRepository.delete(id);
  if (result.affected === 0) {
    throw new Error(`Correspondencia with id ${id} not found.`);
  }
}
  /**
   * Obtiene todas las correspondencias.
   */
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
  /**
   * Actualiza un registro de correspondencia.
   */
async update(id: number, updateCorrespondenciaDto: UpdateCorrespondenciaDto) {
  const registro = await this.findOne(id); // Reutilizamos findOne para verificar que existe
  const registroActualizado = this.correspondenciaRepository.merge(
    registro,
    updateCorrespondenciaDto,
  );
  return this.correspondenciaRepository.save(registroActualizado);
}
}