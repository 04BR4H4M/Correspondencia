import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.enableCors(); // permite peticiones desde otras IPs

  await app.listen(3000, '0.0.0.0'); // escucha desde otras máquinas
  console.log('¡Servidor actualizado!');
}

bootstrap();
