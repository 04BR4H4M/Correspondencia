import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { join } from 'path';
import * as stream from 'stream';

@Injectable()
export class GoogleDriveService {
  private drive;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      keyFile: join(process.cwd(), 'google-credentials.json'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }
async uploadFile(file: Express.Multer.File): Promise<{ id: string; webViewLink: string }> {
  const bufferStream = new stream.PassThrough();
  bufferStream.end(file.buffer);

  const response = await this.drive.files.create({
    requestBody: {
      name: `${new Date().getTime()}-${file.originalname}`,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    },
    media: {
      mimeType: file.mimetype,
      body: bufferStream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true, // <-- ¡ESTA LÍNEA ES CRUCIAL!
  });

  // Con Unidades Compartidas, no necesitamos transferir propiedad.
  // Pero sí necesitamos hacer el archivo legible para cualquiera con el enlace.
  await this.drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
    supportsAllDrives: true, // <-- AÑADIR TAMBIÉN AQUÍ
  });

  return { id: response.data.id, webViewLink: response.data.webViewLink };
}

async deleteFile(fileId: string): Promise<void> {
  await this.drive.files.delete({
    fileId,
    supportsAllDrives: true,
  });
}

async verifyFolderAccess() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  console.log(`Verificando acceso a la carpeta con ID: ${folderId}`);
  try {
    const response = await this.drive.files.get({
      fileId: folderId,
      fields: 'id, name',
    });
    console.log('¡Acceso verificado! Nombre de la carpeta:', response.data.name);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('FALLO al verificar acceso a la carpeta:', error.response?.data?.error || error.message);
    return { success: false, error: error.response?.data?.error || error.message };
  }
}
}