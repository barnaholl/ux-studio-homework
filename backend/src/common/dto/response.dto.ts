import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token (15 min expiry)',
  })
  accessToken!: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logged out' })
  message!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Invalid credentials' })
  message!: string | string[];

  @ApiProperty({ example: 'Unauthorized', required: false })
  error?: string;
}
