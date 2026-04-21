import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  phone: true,
  avatarUrl: true,
  theme: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: USER_SELECT,
    });
    this.logger.info({ userId }, 'Profile updated');
    return updated;
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: USER_SELECT,
    });
    this.logger.info({ userId }, 'User avatar updated');
    return updated;
  }

  /**
   * Delete user account, all contacts, and all associated avatars from S3.
   * Prisma's onDelete: Cascade handles contacts and refresh tokens.
   */
  async deleteMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Delete all avatar files from S3 under this user's prefix
    // Covers: avatars/contacts/{userId}/*, avatars/users/{userId}/*, avatars/tmp/{userId}/*
    const prefixes = [
      `avatars/contacts/${userId}`,
      `avatars/users/${userId}`,
      `avatars/tmp/${userId}`,
    ];

    for (const prefix of prefixes) {
      const objects = await this.s3.listByPrefix(prefix);
      await Promise.all(
        objects.map((obj) => this.s3.delete(obj.key).catch(() => {})),
      );
    }

    // Cascade-delete user → contacts, refresh tokens
    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.info({ userId }, 'User account deleted');
  }
}
