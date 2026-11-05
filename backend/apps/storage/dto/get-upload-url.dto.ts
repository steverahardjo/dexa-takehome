import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

import {
  STORAGE_NAMESPACES,
  type StorageNamespace,
} from '../../../shared/contracts/storage.contracts.js';

export class GetUploadUrlDto {
  /**
   * MIME type of the file that will be uploaded. The service rejects types it
   * cannot serve, so only the shape is checked here.
   */
  @IsString()
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, {
    message: 'contentType must be a MIME type',
  })
  contentType: string;

  /**
   * Name the browser has for the file. Only its extension is used: it has to
   * agree with `contentType`, so a `.png` cannot be uploaded as `image/jpeg`.
   */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/\.[A-Za-z0-9]{2,5}$/, {
    message: 'fileName must have an extension',
  })
  fileName?: string;

  /**
   * Folder the object belongs to. Defaults to `avatars` because that is what
   * the employee service has always asked for.
   */
  @IsOptional()
  @IsIn(Object.values(STORAGE_NAMESPACES))
  namespace?: StorageNamespace;
}
