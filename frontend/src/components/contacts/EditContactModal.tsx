import { useRef } from 'react';
import Modal from '@/components/ui/Modal';
import ContactForm from '@/components/contacts/ContactForm';
import type { ContactFormValues } from '@/components/contacts/ContactForm';
import { useUpdateContact, useStageAvatar, useCommitAvatar } from '@/hooks/useContacts';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { Contact } from '@/types/contact';

interface EditContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
}

export default function EditContactModal({
  isOpen,
  onClose,
  contact,
}: EditContactModalProps) {
  const updateContact = useUpdateContact();
  const stageAvatar = useStageAvatar();
  const commitAvatar = useCommitAvatar();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const stagingPromise = useRef<Promise<{ stageId: string }> | null>(null);

  const handleFileSelect = (file: File) => {
    const promise = stageAvatar.mutateAsync(file);
    stagingPromise.current = promise;
    promise.catch(() => {
      stagingPromise.current = null;
    });
  };

  const handleFileRemove = () => {
    stagingPromise.current = null;
  };

  const handleSubmit = async (
    values: ContactFormValues,
    avatarFile?: File | null,
  ) => {
    if (!contact) return;
    try {
      await updateContact.mutateAsync({ id: contact.id, ...values });

      let avatarFailed = false;
      if (avatarFile && stagingPromise.current) {
        try {
          const { stageId } = await stagingPromise.current;
          await commitAvatar.mutateAsync({
            contactId: contact.id,
            stageId,
          });
        } catch {
          avatarFailed = true;
          addToast('Contact updated but avatar upload failed', {
            type: 'error',
          });
        }
      } else if (avatarFile && !stagingPromise.current) {
        avatarFailed = true;
        addToast('Contact updated but avatar upload failed', {
          type: 'error',
        });
      } else if (avatarFile === null) {
        try {
          await api.delete(`/api/contacts/${contact.id}/avatar`);
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
        } catch {
          avatarFailed = true;
          addToast('Contact updated but avatar removal failed', {
            type: 'error',
          });
        }
      }
      if (!avatarFailed) {
        addToast('Contact updated', { type: 'success' });
      }
      onClose();
    } catch {
      addToast('Failed to update contact', { type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit contact">
      {contact && (
        <ContactForm
          key={contact.id}
          defaultValues={{
            name: contact.name ?? '',
            phone: contact.phone ?? '',
            email: contact.email ?? '',
          }}
          existingAvatar={contact.avatarUrl}
          onSubmit={handleSubmit}
          onCancel={onClose}
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          isSubmitting={updateContact.isPending || commitAvatar.isPending || stageAvatar.isPending}
        />
      )}
    </Modal>
  );
}
