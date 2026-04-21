import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { AvatarCleanupService } from './avatar-cleanup.service';
import { AvatarProcessor } from './avatar.processor';
import { AVATAR_PROCESS_QUEUE } from './avatar.constants';

@Module({
  imports: [BullModule.registerQueue({ name: AVATAR_PROCESS_QUEUE })],
  controllers: [AvatarController],
  providers: [AvatarService, AvatarCleanupService, AvatarProcessor],
  exports: [AvatarService],
})
export class AvatarModule {}
