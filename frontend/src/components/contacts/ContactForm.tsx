import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRef, useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Avatar from '@/components/ui/Avatar';
import { PlusIcon, RefreshIcon, TrashIcon } from '@/components/ui/Icons';


const contactSchema = z.object({
  name: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

interface ContactFormProps {
  defaultValues?: Partial<ContactFormValues>;
  existingAvatar?: string | null;
  onSubmit: (values: ContactFormValues, avatarFile?: File | null) => void;
  onCancel: () => void;
  onFileSelect?: (file: File) => void;
  onFileRemove?: () => void;
  isSubmitting?: boolean;
}

export default function ContactForm({
  defaultValues,
  existingAvatar,
  onSubmit,
  onCancel,
  onFileSelect,
  onFileRemove,
  isSubmitting,
}: ContactFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    watch,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
    },
  });

  const name = watch('name');
  const phone = watch('phone');
  const email = watch('email');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    existingAvatar ?? null,
  );
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    onFileSelect?.(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
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
    onFileRemove?.();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFormSubmit = (values: ContactFormValues) => {
    if (avatarRemoved) {
      onSubmit(values, null);
    } else if (avatarFile) {
      onSubmit(values, avatarFile);
    } else {
      onSubmit(values);
    }
  };

  return (
    <form data-testid="contact-form" onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col">
      <div className="flex flex-col gap-6">
        {/* Avatar section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <Avatar
              src={avatarPreview}
              name={name || 'N'}
              size="lg"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                data-testid="avatar-change-btn"
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
                  data-testid="avatar-remove-btn"
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
              data-testid="avatar-file-input"
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
          label="Name"
          placeholder="Jamie Wright"
          data-testid="contact-name-input"
          {...register('name')}
          error={errors.name?.message}
          autoFocus
        />
        <Input
          label="Phone number"
          placeholder="+01 234 5678"
          type="tel"
          data-testid="contact-phone-input"
          {...register('phone')}
          error={errors.phone?.message}
        />
        <Input
          label="Email address"
          placeholder="jamie.wright@mail.com"
          type="email"
          data-testid="contact-email-input"
          {...register('email')}
          error={errors.email?.message}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-12">
        <Button type="button" variant="secondary" data-testid="contact-form-cancel" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          data-testid="contact-form-submit"
          loading={isSubmitting}
          disabled={
            (!isDirty && !avatarFile && !avatarRemoved) ||
            (!name?.trim() && !phone?.trim() && !email?.trim() && !avatarFile && !avatarPreview)
          }
        >
          Done
        </Button>
      </div>
    </form>
  );
}
