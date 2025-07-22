// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorrespondenciaModule } from './correspondencia/correspondencia.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      database: 'concejo_correspondencia',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // Crea las tablas de la BD automáticamente
    }),
    CorrespondenciaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}