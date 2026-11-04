import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import {
  decodeObjectToken,
  isStreamableStorage,
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage.interface.js';

/**
 * Serves attendance evidence.
 *
 * The URL contains an opaque base64url token rather than a guessable path. The
 * in-memory provider streams bytes; S3 redirects to a short-lived signed URL so
 * the bucket itself never has to be public.
 */
@Controller('storage')
export class StorageController {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  @Public()
  @Get('objects/:token')
  async object(@Param('token') token: string, @Res() response: Response): Promise<void> {
    let key: string;
    try {
      key = decodeObjectToken(token);
    } catch {
      throw new NotFoundException('Object not found');
    }

    if (!key) throw new NotFoundException('Object not found');

    if (isStreamableStorage(this.storage)) {
      const object = await this.storage.read(key);
      response
        .setHeader('Content-Type', object.contentType)
        .setHeader('Cache-Control', 'private, max-age=300')
        .setHeader('X-Content-Type-Options', 'nosniff');
      if (object.contentLength) {
        response.setHeader('Content-Length', object.contentLength);
      }
      response.send(object.body);
      return;
    }

    response.redirect(302, await this.storage.getUrl(key));
  }
}
