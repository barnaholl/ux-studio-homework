import { useRef, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Avatar from '@/components/ui/Avatar';
import { PlusIcon, RefreshIcon, TrashIcon } from '@/components/ui/Icons';
import { useAuth } from '@/contexts/AuthContext';
import {
  useUpdateProfile,
  useStageAvatar,
  useCommitUserAvatar,
  useRemoveUserAvatar,
  useDeleteProfile,
} from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';

const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required'),
  phone: z.string().trim().optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const stageAvatar = useStageAvatar();
  const commitAvatar = useCommitUserAvatar();
  const removeAvatar = useRemoveUserAvatar();
  const deleteProfile = useDeleteProfile();
  const { addToast } = useToast();

  const stagingPromise = useRef<Promise<{ stageId: string }> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.displayName ?? '',
      phone: user?.phone ?? '',
    },
  });

  // Reset form when modal opens with fresh user data
  useEffect(() => {
    if (isOpen && user) {
      reset({
        displayName: user.displayName,
        phone: user.phone ?? '',
      });
      setAvatarPreview(user.avatarUrl);
      setAvatarFile(null);
      setAvatarRemoved(false);
      setAvatarError('');
      setConfirmDelete(false);
      stagingPromise.current = null;
    }
  }, [isOpen, user, reset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setAvatarError('Only JPEG, PNG, WebP and GIF images are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB');
      e.target.value = '';
      return;
    }
    setAvatarFile(file);
    setAvatarRemoved(false);
    const promise = stageAvatar.mutateAsync(file);
    stagingPromise.current = promise;
    promise.catch(() => { stagingPromise.current = null; });
    setAvatarPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemoved(true);
    stagingPromise.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({
        displayName: values.displayName,
        phone: values.phone || undefined,
      });

      // Handle avatar changes
      let avatarFailed = false;
      if (avatarRemoved && user?.avatarUrl) {
        try {
          await removeAvatar.mutateAsync();
        } catch {
          avatarFailed = true;
          addToast('Profile updated but avatar removal failed', { type: 'error' });
        }
      } else if (avatarFile && stagingPromise.current) {
        try {
          const { stageId } = await stagingPromise.current;
          await commitAvatar.mutateAsync(stageId);
        } catch {
          avatarFailed = true;
          addToast('Profile updated but avatar upload failed', { type: 'error' });
        }
      } else if (avatarFile && !stagingPromise.current) {
        avatarFailed = true;
        addToast('Profile updated but avatar upload failed', { type: 'error' });
      }

      if (!avatarFailed) {
        addToast('Profile updated', { type: 'success' });
      }
      onClose();
    } catch {
      addToast('Failed to update profile', { type: 'error' });
    }
  };

  const isSubmitting = updateProfile.isPending || commitAvatar.isPending || removeAvatar.isPending || stageAvatar.isPending;

  const handleDeleteAccount = async () => {
    try {
      await deleteProfile.mutateAsync();
    } catch {
      addToast('Failed to delete account', { type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit profile">
      <form data-testid="profile-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
        <div className="flex flex-col gap-6">
          {/* Avatar section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <Avatar
                src={avatarPreview}
                name={user?.displayName ?? 'U'}
                size="lg"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  data-testid="profile-avatar-change-btn"
                  icon={avatarPreview ? <RefreshIcon /> : <PlusIcon />}
                  className="whitespace-nowrap"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarPreview ? 'Change picture' : 'Add picture'}
                </Button>
                {avatarPreview && (
                  <IconButton
                    type="button"
                    variant="primary"
                    label="Remove picture"
                    data-testid="profile-avatar-remove-btn"
                    onClick={handleRemoveAvatar}
                  >
                    <TrashIcon />
                  </IconButton>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                aria-label="Upload avatar image"
                data-testid="profile-avatar-file-input"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {avatarError && (
              <p className="typo-message text-error" role="alert">
                {avatarError}
              </p>
            )}
          </div>

          {/* Fields */}
          <Input
            label="Display name"
            placeholder="Your name"
            data-testid="profile-display-name-input"
            {...register('displayName')}
            error={errors.displayName?.message}
            autoFocus
          />
          <Input
            label="Phone number"
            placeholder="+01 234 5678"
            type="tel"
            data-testid="profile-phone-input"
            {...register('phone')}
            error={errors.phone?.message}
          />
          <Input
            label="Email"
            data-testid="profile-email-input"
            value={user?.email ?? ''}
            disabled
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-12">
          <div>
            {!confirmDelete ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="profile-delete-account-btn"
                onClick={() => setConfirmDelete(true)}
                className="text-error"
              >
                Delete account
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="typo-message text-error">Are you sure?</span>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="profile-delete-confirm-btn"
                  className="text-error"
                  loading={deleteProfile.isPending}
                  onClick={handleDeleteAccount}
                >
                  Yes, delete
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="profile-delete-cancel-btn"
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" data-testid="profile-cancel-btn" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              data-testid="profile-save-btn"
              loading={isSubmitting}
              disabled={!isDirty && !avatarFile && !avatarRemoved}
            >
              Done
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
