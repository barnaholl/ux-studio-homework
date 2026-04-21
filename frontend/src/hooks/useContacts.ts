import { useMutation, useQuery, useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import api from '@/lib/api';
import { isAxiosError } from 'axios';
import type {
  Contact,
  ContactsResponse,
  CreateContactInput,
  UpdateContactInput,
} from '@/types/contact';

const CONTACTS_KEY = ['contacts'] as const;
const PAGE_SIZE = 50;

export interface ContactsQueryParams {
  search?: string;
  sort?: 'createdAt' | 'name';
  order?: 'asc' | 'desc';
  favourites?: boolean;
}

function buildQueryKey(params?: ContactsQueryParams) {
  return params ? ['contacts', params] : CONTACTS_KEY;
}

export function useContacts(params?: ContactsQueryParams) {
  return useInfiniteQuery({
    queryKey: buildQueryKey(params),
    queryFn: async ({ pageParam }): Promise<ContactsResponse> => {
      const { data } = await api.get<ContactsResponse>('/api/contacts', {
        params: {
          take: PAGE_SIZE,
          ...params,
          favourites: params?.favourites ? 'true' : undefined,
          cursor: pageParam,
        },
      });
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: async (): Promise<Contact> => {
      const { data } = await api.get(`/api/contacts/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

type InfiniteContacts = InfiniteData<ContactsResponse, string | undefined>;

/** Snapshot all contact query caches for rollback */
function snapshotContacts(queryClient: ReturnType<typeof useQueryClient>) {
  const queries = queryClient.getQueriesData<InfiniteContacts>({ queryKey: CONTACTS_KEY });
  return queries.map(([key, data]) => [key, data] as const);
}

/** Restore all contact query caches from a snapshot */
function restoreContacts(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: ReturnType<typeof snapshotContacts>,
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

/** Map over contacts inside all pages of an infinite query */
function updateInfinitePages(
  old: InfiniteContacts | undefined,
  updater: (contacts: Contact[]) => Contact[],
): InfiniteContacts | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: updater(page.data),
    })),
  };
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateContactInput): Promise<Contact> => {
      const { data } = await api.post('/api/contacts', input);
      return data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: CONTACTS_KEY });
      const snapshot = snapshotContacts(queryClient);
      const optimistic: Contact = {
        id: `temp-${Date.now()}`,
        name: input.name ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        avatarUrl: null,
        isFavourite: false,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueriesData<InfiniteContacts>(
        { queryKey: CONTACTS_KEY },
        (old) => updateInfinitePages(old, (contacts) => [...contacts, optimistic]),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreContacts(queryClient, context.snapshot);
      }
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: UpdateContactInput & { id: string }): Promise<Contact> => {
      const { data } = await api.patch(`/api/contacts/${id}`, input);
      return data;
    },
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: CONTACTS_KEY });
      const snapshot = snapshotContacts(queryClient);
      queryClient.setQueriesData<InfiniteContacts>(
        { queryKey: CONTACTS_KEY },
        (old) => updateInfinitePages(old, (contacts) =>
          contacts.map((c) => (c.id === id ? { ...c, ...input } : c)),
        ),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreContacts(queryClient, context.snapshot);
      }
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      try {
        await api.delete(`/api/contacts/${id}`);
      } catch (err: unknown) {
        // Contact already gone — treat as success
        if (isAxiosError(err) && err.response?.status === 404) return;
        throw err;
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CONTACTS_KEY });
      const snapshot = snapshotContacts(queryClient);
      queryClient.setQueriesData<InfiniteContacts>(
        { queryKey: CONTACTS_KEY },
        (old) => updateInfinitePages(old, (contacts) =>
          contacts.filter((c) => c.id !== id),
        ),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreContacts(queryClient, context.snapshot);
      }
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });
}

export function useRestoreContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.post(`/api/contacts/${id}/restore`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });
}

export function useToggleFavourite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      isFavourite,
    }: {
      id: string;
      isFavourite: boolean;
    }): Promise<void> => {
      if (isFavourite) {
        await api.delete(`/api/contacts/${id}/favourite`);
      } else {
        await api.post(`/api/contacts/${id}/favourite`);
      }
    },
    onMutate: async ({ id, isFavourite }) => {
      await queryClient.cancelQueries({ queryKey: CONTACTS_KEY });
      const snapshot = snapshotContacts(queryClient);
      queryClient.setQueriesData<InfiniteContacts>(
        { queryKey: CONTACTS_KEY },
        (old) => updateInfinitePages(old, (contacts) =>
          contacts.map((c) =>
            c.id === id ? { ...c, isFavourite: !isFavourite } : c,
          ),
        ),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreContacts(queryClient, context.snapshot);
      }
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });
}

export function useStageAvatar() {
  return useMutation({
    mutationFn: async (file: File): Promise<{ stageId: string }> => {
      if (import.meta.env.DEV) {
        console.debug('[Avatar] Stage upload start', { size: file.size, type: file.type });
      }
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ stageId: string }>(
        '/api/avatars/stage',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      if (import.meta.env.DEV) {
        console.debug('[Avatar] Stage upload complete', { stageId: data.stageId });
      }
      return data;
    },
    retry: 2,
  });
}

export function useCommitAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      stageId,
    }: {
      contactId: string;
      stageId: string;
    }): Promise<void> => {
      if (import.meta.env.DEV) {
        console.debug('[Avatar] Commit start', { contactId, stageId });
      }
      await api.post(`/api/contacts/${contactId}/avatar/commit`, { stageId });
      if (import.meta.env.DEV) {
        console.debug('[Avatar] Commit complete', { contactId });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });
}
