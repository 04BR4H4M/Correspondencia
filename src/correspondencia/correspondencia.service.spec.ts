import { Test, TestingModule } from '@nestjs/testing';
import { CorrespondenciaService } from './correspondencia.service';

describe('CorrespondenciaService', () => {
  let service: CorrespondenciaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CorrespondenciaService],
    }).compile();

    service = module.get<CorrespondenciaService>(CorrespondenciaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
