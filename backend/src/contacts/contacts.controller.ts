import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import {
  ContactResponseDto,
  ContactListResponseDto,
  FavouriteResponseDto,
} from './dto/contact-response.dto';
import { CurrentUser } from '../auth/decorators';
import type { JwtPayload } from '../auth/decorators';

@ApiBearerAuth()
@ApiTags('Contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'List contacts with optional search and pagination',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Case-insensitive search across name, phone and email',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor (last contact ID from previous page)',
  })
  @ApiQuery({
    name: 'take',
    required: false,
    type: Number,
    description: 'Page size (default 50)',
  })
  @ApiQuery({
    name: 'favourites',
    required: false,
    type: Boolean,
    description: 'Filter to favourites only',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['createdAt', 'name'],
    description: 'Sort field (default createdAt)',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction (default desc)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated contacts list',
    type: ContactListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @Header('Cache-Control', 'no-store')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('favourites') favourites?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.contactsService.findAll(
      user.sub,
      search,
      cursor || undefined,
      take ? Number(take) : undefined,
      favourites === 'true',
      sort === 'name' ? 'name' : 'createdAt',
      order === 'asc' ? 'asc' : order === 'desc' ? 'desc' : undefined,
    );
  }

  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Get a single contact by ID',
    description:
      'Returns a single contact owned by the authenticated user, including favourite status.',
  })
  @ApiResponse({
    status: 200,
    description: 'The contact',
    type: ContactResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  @Header('Cache-Control', 'no-store')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contactsService.findOne(id, user.sub);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new contact',
    description: 'Creates a new contact for the authenticated user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Contact created',
    type: ContactResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateContactDto, @CurrentUser() user: JwtPayload) {
    return this.contactsService.create(dto, user.sub);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Partially update a contact',
    description:
      'Updates the specified fields of a contact owned by the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact updated',
    type: ContactResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.contactsService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a contact',
    description:
      'Deletes a contact and its avatar files. Only the owning user can delete.',
  })
  @ApiResponse({ status: 204, description: 'Contact deleted' })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contactsService.remove(id, user.sub);
  }

  @Post(':id/restore')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Restore a soft-deleted contact',
    description:
      'Restores a recently deleted contact before the purge window expires.',
  })
  @ApiResponse({ status: 204, description: 'Contact restored' })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  restore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contactsService.restore(id, user.sub);
  }

  @Delete(':id/avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a contact avatar',
    description:
      'Clears the avatar URL from the contact and deletes avatar files from S3.',
  })
  @ApiResponse({ status: 204, description: 'Avatar removed' })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  removeAvatar(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.contactsService.removeAvatar(id, user.sub);
  }

  @Post(':id/favourite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a contact as favourite',
    description:
      "Adds the contact to the authenticated user's favourites list. Idempotent — re-favouriting a contact is a no-op.",
  })
  @ApiResponse({
    status: 200,
    description: 'Contact favourited',
    type: FavouriteResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  addFavourite(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contactsService.addFavourite(id, user.sub);
  }

  @Delete(':id/favourite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Remove a contact from favourites',
    description:
      "Removes the contact from the authenticated user's favourites list.",
  })
  @ApiResponse({
    status: 200,
    description: 'Contact unfavourited',
    type: FavouriteResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found or not owned by user',
  })
  removeFavourite(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contactsService.removeFavourite(id, user.sub);
  }
}
