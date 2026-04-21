import { useRef } from 'react';
import Modal from '@/components/ui/Modal';
import ContactForm from '@/components/contacts/ContactForm';
import type { ContactFormValues } from '@/components/contacts/ContactForm';
import { useCreateContact, useStageAvatar, useCommitAvatar } from '@/hooks/useContacts';
import { useToast } from '@/components/ui/Toast';

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddContactModal({
  isOpen,
  onClose,
}: AddContactModalProps) {
  const createContact = useCreateContact();
  const stageAvatar = useStageAvatar();
  const commitAvatar = useCommitAvatar();
  const { addToast } = useToast();
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
    try {
      const contact = await createContact.mutateAsync(values);
      let avatarFailed = false;
      if (avatarFile && stagingPromise.current && !contact.id.startsWith('temp-')) {
        try {
          const { stageId } = await stagingPromise.current;
          await commitAvatar.mutateAsync({
            contactId: contact.id,
            stageId,
          });
        } catch {
          avatarFailed = true;
          addToast('Contact created but avatar upload failed', {
            type: 'error',
          });
        }
      } else if (avatarFile && !stagingPromise.current) {
        avatarFailed = true;
        addToast('Contact created but avatar upload failed', {
          type: 'error',
        });
      }
      if (!avatarFailed) {
        addToast('Contact added', { type: 'success' });
      }
      onClose();
    } catch {
      addToast('Failed to create contact', { type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add contact">
      <ContactForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        onFileSelect={handleFileSelect}
        onFileRemove={handleFileRemove}
        isSubmitting={createContact.isPending || commitAvatar.isPending || stageAvatar.isPending}
      />
    </Modal>
  );
}
