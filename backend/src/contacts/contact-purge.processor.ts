import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarService } from '../avatar/avatar.service';

export const CONTACT_PURGE_QUEUE = 'contact-purge';

export interface ContactPurgeJobData {
  contactId: string;
  userId: string;
}

@Processor(CONTACT_PURGE_QUEUE)
export class ContactPurgeProcessor extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly avatarService: AvatarService,
  ) {
    super();
    this.logger.setContext(ContactPurgeProcessor.name);
  }

  async process(job: Job<ContactPurgeJobData>): Promise<void> {
    const { contactId, userId } = job.data;
    this.logger.info({ contactId, userId }, 'Purging soft-deleted contact');

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    // If the contact was restored (deletedAt cleared) or already hard-deleted, skip
    if (!contact || !contact.deletedAt) {
      this.logger.info(
        { contactId },
        'Contact already restored or purged, skipping',
      );
      return;
    }

    // Verify ownership
    if (contact.userId !== userId) {
      this.logger.warn(
        { contactId, userId },
        'Ownership mismatch, skipping purge',
      );
      return;
    }

    // Delete avatar files from S3
    if (contact.avatarUrl) {
      this.avatarService.deleteAvatarByUrl(contact.avatarUrl);
    }

    // Hard-delete the contact (cascades to refresh tokens)
    await this.prisma.contact.delete({ where: { id: contactId } });
    this.logger.info({ contactId }, 'Contact permanently deleted');
  }
}
