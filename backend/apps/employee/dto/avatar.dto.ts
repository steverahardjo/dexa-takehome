import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches } from 'class-validator';

/** What the browser may upload as an avatar, and what MinIO will sign for. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AvatarContentType = (typeof AVATAR_TYPES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * `POST /employees/avatar/upload-url`: the file the browser is about to PUT to
 * MinIO. Nothing is uploaded here — this only reserves a key and a URL.
 */
export class RequestAvatarUploadDto {
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  @Matches(/\.(jpe?g|png|webp)$/i, {
    message: 'fileName must be a .jpg, .jpeg, .png or .webp file',
  })
  fileName: string;

  @IsIn(AVATAR_TYPES, { message: 'contentType must be a jpeg, png or webp' })
  contentType: AvatarContentType;
}

/** The answer the browser needs to upload and then reference the object. */
export interface AvatarUploadUrl {
  /** Send this back as `avatarKey` when creating or updating the employee. */
  key: string;
  /** `PUT` the bytes here, with `Content-Type` set to what was declared. */
  uploadUrl: string;
  /** Seconds the URL stays valid. */
  expiresIn: number;
}
