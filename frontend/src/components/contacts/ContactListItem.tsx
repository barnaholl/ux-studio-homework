import { memo, forwardRef, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Contact } from '@/types/contact';
import Avatar from '@/components/ui/Avatar';
import IconButton from '@/components/ui/IconButton';
import ContextMenu from '@/components/ui/ContextMenu';
import Tooltip from '@/components/ui/Tooltip';
import { MuteIcon, PhoneIcon, MoreIcon, EditIcon, HeartIcon, HeartFilledIcon, TrashIcon } from '@/components/ui/Icons';

interface ContactListItemProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onToggleFavourite: (contact: Contact) => void;
  tabIndex?: number;
  onFocus?: () => void;
}

const ContactListItemBase = forwardRef<HTMLDivElement, ContactListItemProps>(
  function ContactListItem(
    { contact, onEdit, onDelete, onToggleFavourite, tabIndex = -1, onFocus },
    ref,
  ) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const handleEdit = useCallback(() => onEdit(contact), [contact, onEdit]);
  const handleDelete = useCallback(() => onDelete(contact), [contact, onDelete]);
  const handleFavourite = useCallback(() => {
    if (!contact.isFavourite) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 400);
    }
    onToggleFavourite(contact);
  }, [contact, onToggleFavourite]);

  return (
    <motion.div
      ref={ref}
      role="listitem"
      data-testid="contact-list-item"
      data-contact-id={contact.id}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleEdit();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          handleDelete();
        }
      }}
      className="flex items-center h-16 px-0 group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-(--btn-primary) focus-visible:rounded-lg"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Avatar src={contact.avatarUrl} name={contact.name ?? contact.email ?? '?'} size="sm" />

      <div className="ml-4 min-w-0 flex-1">
        <Tooltip content={contact.name ?? contact.email ?? contact.phone ?? 'No name'}>
          <p className="typo-h3 text-(--text-primary) truncate">
            {contact.name ?? contact.email ?? contact.phone ?? 'No name'}
          </p>
        </Tooltip>
        <Tooltip content={contact.name
            ? (contact.phone ?? contact.email ?? '')
            : contact.email
              ? (contact.phone ?? '')
              : ''}>
          <p className="typo-message text-(--text-secondary) truncate">
            {contact.name
              ? (contact.phone ?? contact.email ?? '')
              : contact.email
                ? (contact.phone ?? '')
                : ''}
          </p>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 ml-2 lg:opacity-0 lg:pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto transition-opacity duration-150">
        <IconButton label="Mute" data-testid="contact-mute-btn">
          <MuteIcon />
        </IconButton>
        <IconButton label="Call" data-testid="contact-call-btn">
          <PhoneIcon />
        </IconButton>
        <IconButton
          ref={moreRef}
          label="More actions"
          data-testid="contact-more-btn"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <MoreIcon />
        </IconButton>
      </div>

      <ContextMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={moreRef}
        items={[
          {
            label: 'Edit',
            icon: <EditIcon width={20} height={20} />,
            onClick: handleEdit,
          },
          {
            label: contact.isFavourite ? 'Unfavourite' : 'Favourite',
            icon: (
              <motion.span
                animate={heartBurst ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {contact.isFavourite ? (
                  <HeartFilledIcon width={20} height={20} className="text-error" />
                ) : (
                  <HeartIcon width={20} height={20} />
                )}
              </motion.span>
            ),
            onClick: handleFavourite,
          },
          {
            label: 'Remove',
            icon: <TrashIcon width={20} height={20} />,
            onClick: handleDelete,
          },
        ]}
      />
    </motion.div>
  );
  },
);

const ContactListItem = memo(ContactListItemBase);

export default ContactListItem;
