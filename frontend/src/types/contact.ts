export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  isFavourite: boolean;
  createdAt: string;
}

export interface ContactsResponse {
  data: Contact[];
  nextCursor: string | null;
}

export interface CreateContactInput {
  name?: string;
  phone?: string;
  email?: string;
}

export interface UpdateContactInput {
  name?: string;
  phone?: string;
  email?: string;
}
