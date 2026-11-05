import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Identifies an object by the key handed out by `getUploadUrl`. The key format
 * itself is validated by the service, which owns that rule.
 */
export class ObjectKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  key: string;
}
