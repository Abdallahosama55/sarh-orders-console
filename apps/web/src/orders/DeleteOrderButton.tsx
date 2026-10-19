import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../lib/api-client';
import { deleteOrder } from './orders-api';
import { orderKeys } from './query-keys';

export function DeleteOrderButton({
  orderId,
  onDeleted,
}: {
  orderId: number;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteOrder(orderId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: orderKeys.detail(orderId) });
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: orderKeys.stats() });
      onDeleted();
    },
  });

  if (!confirming) {
    return (
      <button
        type="button"
        className="button button--danger-outline"
        onClick={() => setConfirming(true)}
      >
        Delete order
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label="Confirm deletion">
      <p>
        Delete order #{orderId}? It disappears from the console but is kept, with your name, for
        audit.
      </p>
      <div className="confirm__actions">
        <button
          type="button"
          className="button"
          onClick={() => setConfirming(false)}
          disabled={remove.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Deleting…' : 'Yes, delete'}
        </button>
      </div>
      {remove.isError && (
        <p className="alert alert--error" role="alert">
          {errorMessage(remove.error)}
        </p>
      )}
    </div>
  );
}
