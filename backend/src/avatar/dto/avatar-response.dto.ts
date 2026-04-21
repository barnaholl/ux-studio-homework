import { ApiProperty } from '@nestjs/swagger';

export class StagedAvatarResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Stage ID to pass to the commit endpoint',
  })
  stageId!: string;
}

export class AvatarCommitResponseDto {
  @ApiProperty({
    example: 'https://cdn.example.com/avatars/contacts/abc-120.webp',
    description:
      'Public URL of the committed avatar (base path, without size suffix)',
  })
  avatarUrl!: string;
}
