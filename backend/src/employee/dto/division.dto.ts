import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDivisionDto {
  @Transform(trim)
  @IsString()
  @Length(2, 128)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class UpdateDivisionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 128)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (value === null ? null : String(value).trim()))
  @IsString()
  @Length(0, 2000)
  description?: string | null;
}
