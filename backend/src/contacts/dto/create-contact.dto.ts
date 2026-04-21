import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateContactDto {
  @ApiProperty({
    example: 'Jane Doe',
    description: 'Full name of the contact',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  name?: string;

  @ApiProperty({ example: '+36 1 234 5678', required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed || undefined;
  })
  phone?: string;

  @ApiProperty({ example: 'jane.doe@example.com', required: false })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed || undefined;
  })
  email?: string;
}
