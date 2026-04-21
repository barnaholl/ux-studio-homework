import {
  Controller,
  Param,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AvatarService } from './avatar.service';
import { CurrentUser } from '../auth/decorators';
import type { JwtPayload } from '../auth/decorators';
import {
  StagedAvatarResponseDto,
  AvatarCommitResponseDto,
} from './dto/avatar-response.dto';
import { CommitAvatarDto } from './dto/commit-avatar.dto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiBearerAuth()
@ApiTags('Avatars')
@Controller()
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post('avatars/stage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, WebP, or GIF, max 5 MB)',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Stage an avatar for later commit',
    description:
      'Validates, resizes (40px + 120px WebP), and uploads the avatar to S3 immediately. Returns a stageId that can be committed to a contact or user later.',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar staged successfully',
    type: StagedAvatarResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  stageAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp|gif)$/,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.avatarService.stageAvatar(user.sub, file.buffer, file.mimetype);
  }

  @Post('contacts/:id/avatar/commit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Commit a staged avatar to a contact',
    description:
      'Associates a previously staged avatar with a contact. The resized images are already in S3, so this only updates the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar committed',
    type: AvatarCommitResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired stage ID' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  commitContactAvatar(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CommitAvatarDto,
  ) {
    return this.avatarService.commitContactAvatar(id, user.sub, dto.stageId);
  }

  @Post('users/me/avatar/commit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Commit a staged avatar to the current user',
    description:
      'Associates a previously staged avatar with the authenticated user. The resized images are already in S3, so this only updates the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar committed',
    type: AvatarCommitResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired stage ID' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  commitUserAvatar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CommitAvatarDto,
  ) {
    return this.avatarService.commitUserAvatar(user.sub, dto.stageId);
  }

  @Delete('users/me/avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the current user avatar' })
  @ApiResponse({ status: 204, description: 'Avatar removed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  removeUserAvatar(@CurrentUser() user: JwtPayload) {
    return this.avatarService.removeUserAvatar(user.sub);
  }
}
