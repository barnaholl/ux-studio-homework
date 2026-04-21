import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateUserDto {
  @ApiProperty({ example: 'Jane Doe', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  displayName?: string;

  @ApiProperty({ example: '+36 1 234 5678', required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed || undefined;
  })
  phone?: string;

  @ApiProperty({
    example: 'dark',
    enum: ['light', 'dark', 'system'],
    required: false,
  })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: string;
}
