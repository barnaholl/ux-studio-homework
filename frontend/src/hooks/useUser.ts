import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useStageAvatar } from '@/hooks/useContacts';

interface UpdateProfileInput {
  displayName?: string;
  phone?: string;
}

export function useUpdateProfile() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput): Promise<void> => {
      await api.patch('/users/me', input);
    },
    onSuccess: () => { refreshUser().catch(() => {}); },
  });
}

export function useCommitUserAvatar() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (stageId: string): Promise<void> => {
      await api.post('/users/me/avatar/commit', { stageId });
    },
    onSuccess: () => { refreshUser().catch(() => {}); },
  });
}

export function useRemoveUserAvatar() {
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.delete('/users/me/avatar');
    },
    onSuccess: () => { refreshUser().catch(() => {}); },
  });
}

export function useDeleteProfile() {
  const { logout } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.delete('/users/me');
    },
    onSuccess: () => logout(),
  });
}

export { useStageAvatar };
