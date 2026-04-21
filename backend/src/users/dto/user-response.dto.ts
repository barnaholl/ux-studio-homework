import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'clxyz123abc' })
  id!: string;

  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  displayName!: string;

  @ApiProperty({ example: '+36 1 234 5678', nullable: true })
  phone!: string | null;

  @ApiProperty({
    example: 'https://cdn.example.com/avatars/users/abc-120.webp',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({ example: 'system', enum: ['light', 'dark', 'system'] })
  theme!: string;

  @ApiProperty({ example: '2026-04-18T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-04-18T10:00:00.000Z' })
  updatedAt!: Date;
}
