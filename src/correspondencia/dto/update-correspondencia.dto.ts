import { PartialType } from '@nestjs/mapped-types';
import { CreateCorrespondenciaDto } from './create-correspondencia.dto';

export class UpdateCorrespondenciaDto extends PartialType(CreateCorrespondenciaDto) {}
