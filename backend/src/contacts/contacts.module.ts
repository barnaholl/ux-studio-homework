import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AvatarModule } from '../avatar/avatar.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import {
  ContactPurgeProcessor,
  CONTACT_PURGE_QUEUE,
} from './contact-purge.processor';

@Module({
  imports: [
    AvatarModule,
    BullModule.registerQueue({ name: CONTACT_PURGE_QUEUE }),
  ],
  controllers: [ContactsController],
  providers: [ContactsService, ContactPurgeProcessor],
})
export class ContactsModule {}
