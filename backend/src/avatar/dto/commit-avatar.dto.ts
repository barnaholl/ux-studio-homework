import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CommitAvatarDto {
  @ApiProperty({
    description: 'Stage ID returned by the avatar staging endpoint',
  })
  @IsUUID()
  stageId!: string;
}
