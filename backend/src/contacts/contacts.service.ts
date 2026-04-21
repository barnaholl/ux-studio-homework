import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarService } from '../avatar/avatar.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { REDIS_CLIENT } from '../redis/redis.module';
import {
  CONTACT_PURGE_QUEUE,
  type ContactPurgeJobData,
} from './contact-purge.processor';

const MAX_TAKE = 1000;
const PAGE_SIZE = 50;
const CACHE_TTL_SECONDS = 300;
const PURGE_DELAY_MS = 10_000; // 10 seconds — enough time for undo

/** Fields projected in list queries — omits sortName, deletedAt, userId, updatedAt. */
const LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatarUrl: true,
  isFavourite: true,
  createdAt: true,
} as const;

/** Compute the sortName from the contact fields (name > email > phone). */
function computeSortName(fields: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  return (fields.name ?? fields.email ?? fields.phone ?? '').toLowerCase();
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatarService: AvatarService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(CONTACT_PURGE_QUEUE) private readonly purgeQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactsService.name);
  }

  async findAll(
    userId: string,
    search?: string,
    cursor?: string,
    take = PAGE_SIZE,
    favouritesOnly = false,
    sort: 'createdAt' | 'name' = 'createdAt',
    order?: 'asc' | 'desc',
  ) {
    take = Number.isFinite(take)
      ? Math.min(MAX_TAKE, Math.max(1, Math.floor(take)))
      : PAGE_SIZE;

    const effectiveOrder = order ?? (sort === 'createdAt' ? 'desc' : 'asc');

    // Version-based cache
    const version = await this.redis.get(`contacts:version:${userId}`);
    const cacheKey = `contacts:${userId}:${version ?? '0'}:${search ?? ''}:${cursor ?? ''}:${take}:${favouritesOnly}:${sort}:${effectiveOrder}`;

    // Strip search term from logged cache key to avoid PII leakage
    const logKey = `contacts:${userId}:${version ?? '0'}:[search]:${cursor ?? ''}:${take}:${favouritesOnly}:${sort}:${effectiveOrder}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug({ cacheKey: logKey }, 'Cache hit');
      return JSON.parse(cached) as {
        data: Record<string, unknown>[];
        nextCursor: string | null;
      };
    }
    this.logger.debug({ cacheKey: logKey }, 'Cache miss');

    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {};

    const where: Prisma.ContactWhereInput = {
      userId,
      deletedAt: null,
      ...searchFilter,
      ...(favouritesOnly ? { isFavourite: true } : {}),
    };

    if (sort === 'name') {
      // sortName is a pre-computed COALESCE(name, email, phone).toLowerCase()
      // so we can use Prisma cursor-based pagination directly.
      const data = await this.prisma.contact.findMany({
        where,
        orderBy: [{ sortName: effectiveOrder }, { id: 'asc' }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take,
        select: LIST_SELECT,
      });

      const nextCursor = data.length === take ? data[data.length - 1].id : null;

      const result = { data, nextCursor };
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        CACHE_TTL_SECONDS,
      );
      return result;
    }

    // createdAt sort: Prisma cursor-based pagination
    const data = await this.prisma.contact.findMany({
      where,
      orderBy: [{ createdAt: effectiveOrder }, { id: 'asc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take,
      select: LIST_SELECT,
    });

    const nextCursor = data.length === take ? data[data.length - 1].id : null;

    const result = { data, nextCursor };

    // Cache the result
    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      CACHE_TTL_SECONDS,
    );

    return result;
  }

  async findOne(id: string, userId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        userId: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    if (!contact || contact.userId !== userId || contact.deletedAt) {
      throw new NotFoundException(`Contact ${id} not found`);
    }
    const { deletedAt: _, ...rest } = contact;
    return rest;
  }

  async create(dto: CreateContactDto, userId: string) {
    const contact = await this.prisma.contact.create({
      data: {
        ...dto,
        sortName: computeSortName(dto),
        user: { connect: { id: userId } },
      },
    });
    const { sortName: _sn, ...rest } = contact;
    await this.invalidateCache(userId);
    this.logger.info({ contactId: contact.id, userId }, 'Contact created');
    return rest;
  }

  async update(id: string, dto: UpdateContactDto, userId: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId || existing.deletedAt) {
      throw new NotFoundException(`Contact ${id} not found`);
    }

    // Recompute sortName if any of the relevant fields changed
    const merged = {
      name: dto.name !== undefined ? dto.name : existing.name,
      email: dto.email !== undefined ? dto.email : existing.email,
      phone: dto.phone !== undefined ? dto.phone : existing.phone,
    };
    const data = { ...dto, sortName: computeSortName(merged) };

    try {
      const updated = await this.prisma.contact.update({
        where: { id },
        data,
      });
      await this.invalidateCache(userId);
      this.logger.info({ contactId: id, userId }, 'Contact updated');
      const { sortName: _sn, ...rest } = updated;
      return rest;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      )
        throw new NotFoundException(`Contact ${id} not found`);
      throw e;
    }
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId || existing.deletedAt) {
      throw new NotFoundException(`Contact ${id} not found`);
    }

    // Soft-delete: set deletedAt instead of removing the row
    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.invalidateCache(userId);
    this.logger.info({ contactId: id, userId }, 'Contact soft-deleted');

    // Schedule hard purge after the undo window expires
    await this.purgeQueue.add(
      'purge-contact',
      { contactId: id, userId } satisfies ContactPurgeJobData,
      { delay: PURGE_DELAY_MS, removeOnComplete: true, removeOnFail: 50 },
    );
  }

  async restore(id: string, userId: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(`Contact ${id} not found`);
    }

    // Clear deletedAt to restore the contact
    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.invalidateCache(userId);
    this.logger.info({ contactId: id, userId }, 'Contact restored');
  }

  async removeAvatar(id: string, userId: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(`Contact ${id} not found`);
    }
    if (existing.avatarUrl) {
      await this.prisma.contact.update({
        where: { id },
        data: { avatarUrl: null },
      });
      this.avatarService.deleteAvatarByUrl(existing.avatarUrl);
      await this.invalidateCache(userId);
      this.logger.info({ contactId: id, userId }, 'Contact avatar removed');
    }
  }

  async addFavourite(contactId: string, userId: string) {
    try {
      await this.prisma.contact.update({
        where: { id: contactId, userId, deletedAt: null },
        data: { isFavourite: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Contact ${contactId} not found`);
      }
      throw e;
    }

    await this.invalidateCache(userId);
    this.logger.info({ contactId, userId }, 'Favourite added');
    return { isFavourite: true };
  }

  async removeFavourite(contactId: string, userId: string) {
    try {
      await this.prisma.contact.update({
        where: { id: contactId, userId, deletedAt: null },
        data: { isFavourite: false },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Contact ${contactId} not found`);
      }
      throw e;
    }

    await this.invalidateCache(userId);
    this.logger.info({ contactId, userId }, 'Favourite removed');
    return { isFavourite: false };
  }

  /** Bump the version counter to invalidate all cached queries for this user */
  private async invalidateCache(userId: string): Promise<void> {
    await this.redis.incr(`contacts:version:${userId}`);
  }
}
