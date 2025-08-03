import { IsArray, IsNumber, ArrayNotEmpty } from 'class-validator';

export class BulkDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  ids: number[];
}