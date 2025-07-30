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
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
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
    });

    await this.drive.permissions.create({
      fileId: response.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return response.data.webViewLink;
  }
}