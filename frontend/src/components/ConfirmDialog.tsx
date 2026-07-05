import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
}

export default function ConfirmDialog({
  isOpen, onClose, onConfirm,
  title, message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
}: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className={`flex-shrink-0 p-2 rounded-lg ${
            variant === 'danger' ? 'bg-red-500/10' : 'bg-yellow-500/10'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${
              variant === 'danger' ? 'text-red-400' : 'text-yellow-400'
            }`} />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} disabled={loading} className="btn-secondary btn-sm">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={variant === 'danger' ? 'btn-danger btn-sm' : 'btn-warning btn-sm'}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
