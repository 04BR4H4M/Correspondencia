import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config } from 'dotenv';
import * as session from 'express-session';
import * as passport from 'passport';

config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.enableCors({ origin: true, credentials: true }); // permite peticiones desde otras IPs

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'cambia-esta-clave-en-produccion',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
        // secure: true, // actívalo cuando el sitio corra bajo HTTPS en producción
      },
    }),
  );
  app.use(passport.initialize());

  await app.listen(3000, '0.0.0.0'); // escucha desde otras máquinas
  console.log('¡Servidor actualizado!');
}

bootstrap();