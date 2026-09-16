import { BadRequestException, PipeTransform } from '@nestjs/common';

interface FilePipeOptions {
  maxSizeMb?: number;
  allowedMimes?: string[];
}

const DEFAULT_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export class FilePipe implements PipeTransform {
  constructor(private options: FilePipeOptions = {}) {}

  transform(file: Express.Multer.File) {
    const { maxSizeMb = 5, allowedMimes = DEFAULT_ALLOWED_MIMES } =
      this.options;

    if (!file) throw new BadRequestException('File is required');

    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const userFileSize = (file.size / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `File size exceeds ${maxSizeMb}MB limit. Your file: ${userFileSize}MB`,
      );
    }

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type not allowed. Allowed types: ${allowedMimes.join(', ')}`,
      );
    }

    return file;
  }
}
