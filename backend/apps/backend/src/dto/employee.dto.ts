import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches } from 'class-validator';

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** File the browser is about to PUT to MinIO as an employee avatar. */
export class AvatarUploadDto {
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  @Matches(/\.(jpe?g|png|webp)$/i, {
    message: 'fileName must be a .jpg, .jpeg, .png or .webp file',
  })
  fileName: string;

  @IsIn(AVATAR_TYPES, { message: 'contentType must be a jpeg, png or webp' })
  contentType: (typeof AVATAR_TYPES)[number];
}
