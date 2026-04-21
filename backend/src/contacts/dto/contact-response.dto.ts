import { ApiProperty } from '@nestjs/swagger';

/** Lean shape returned by GET /contacts (list endpoint). */
export class ContactListItemDto {
  @ApiProperty({ example: 'clxyz456def' })
  id!: string;

  @ApiProperty({ example: 'John Smith', nullable: true })
  name!: string | null;

  @ApiProperty({ example: '+36 1 234 5678', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'jane.doe@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({
    example: 'https://cdn.example.com/avatars/contacts/abc/def-120.webp',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({ example: false })
  isFavourite!: boolean;

  @ApiProperty({ example: '2026-04-18T10:00:00.000Z' })
  createdAt!: Date;
}

/** Full shape returned by GET /contacts/:id, POST, PATCH. */
export class ContactResponseDto extends ContactListItemDto {
  @ApiProperty({ example: 'clxyz123abc' })
  userId!: string;

  @ApiProperty({ example: '2026-04-18T10:00:00.000Z' })
  updatedAt!: Date;
}

export class ContactListResponseDto {
  @ApiProperty({ type: [ContactListItemDto] })
  data!: ContactListItemDto[];

  @ApiProperty({
    example: 'clxyz789ghi',
    nullable: true,
    description: 'Cursor for the next page, null if no more results',
  })
  nextCursor!: string | null;
}

export class FavouriteResponseDto {
  @ApiProperty({ example: true })
  isFavourite!: boolean;
}
