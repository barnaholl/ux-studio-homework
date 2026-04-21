import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';
import { PlusIcon } from '@/components/ui/Icons';

interface EmptyStateProps {
  onAddContact: () => void;
}

export default function EmptyState({ onAddContact }: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-24 gap-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Minimal line-art illustration */}
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        className="text-(--text-disabled)"
        aria-hidden="true"
      >
        <circle
          cx="60"
          cy="40"
          r="18"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M30 95c0-16.569 13.431-30 30-30s30 13.431 30 30"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle
          cx="60"
          cy="60"
          r="55"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity="0.4"
        />
      </svg>

      <div className="text-center">
        <h3 className="text-(--text-primary) mb-2">
          No contacts yet
        </h3>
        <p className="typo-message text-(--text-secondary)">
          Add your first contact to get started
        </p>
      </div>

      <Button
        variant="special"
        icon={<PlusIcon width={16} height={16} />}
        onClick={onAddContact}
      >
        Add new
      </Button>
    </motion.div>
  );
}
