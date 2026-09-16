import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import * as path from 'path';
import * as crypto from 'crypto';

export type UploadKind = 'image' | 'document';

export interface UploadResult {
  url: string;
  publicId: string;
  resourceType: string;
}

@Injectable()
export class UploadService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    kind: UploadKind = 'image',
  ): Promise<UploadResult> {
    const isImage = kind === 'image';

    const ext = path.extname(file.originalname);
    const rawName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '_');
    const cleanName = rawName.length > 0 ? rawName : 'file';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const customPublicId = `${cleanName}-${uniqueSuffix}`;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: isImage ? 'image' : 'raw',
          ...(!isImage && { public_id: `${customPublicId}${ext}` }),
          ...(isImage && {
            transformation: [
              { width: 1080, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' },
            ],
          }),
        },
        (error, res) => {
          if (error || !res) {
            return reject(
              error instanceof Error
                ? error
                : new BadRequestException('Upload ke Cloudinary gagal'),
            );
          }
          resolve(res);
        },
      );

      Readable.from(file.buffer).pipe(upload);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
    };
  }

  async deleteFile(
    publicId: string,
    resourceType: string = 'image',
  ): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  }
}
