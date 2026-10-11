import {
  getPendingOperations,
  updateOperationStatus,
  removeOperation,
  clearCompletedOperations,
  PendingOperation
} from './offlineDb';

const SYNC_BATCH_SIZE = 50;

let isSyncing = false;

export async function syncPendingOperations(branchId?: string): Promise<{
  success: number;
  failed: number;
  total: number;
}> {
  if (isSyncing) {
    console.log('Sync already in progress');
    return { success: 0, failed: 0, total: 0 };
  }

  if (!navigator.onLine) {
    console.log('Cannot sync: offline');
    return { success: 0, failed: 0, total: 0 };
  }

  isSyncing = true;
  window.dispatchEvent(new Event('sync-start'));

  try {
    const operations = await getPendingOperations(branchId);
    const pendingOps = operations.filter(
      op => op.status === 'pending' || op.status === 'failed'
    );

    if (pendingOps.length === 0) {
      await clearCompletedOperations();
      return { success: 0, failed: 0, total: 0 };
    }

    console.log(`Syncing ${pendingOps.length} pending operations`);

    let success = 0;
    let failed = 0;

    const batches = chunkArray(pendingOps, SYNC_BATCH_SIZE);

    for (const batch of batches) {
      const results = await syncBatch(batch);

      for (let i = 0; i < batch.length; i++) {
        const op = batch[i];
        const result = results[i];

        if (result.success) {
          await removeOperation(op.id);
          success++;
        } else {
          await updateOperationStatus(op.id, 'failed', result.error);
          failed++;
        }
      }
    }

    await clearCompletedOperations();

    console.log(`Sync complete: ${success} success, ${failed} failed`);
    return { success, failed, total: pendingOps.length };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: 0, failed: 0, total: 0 };
  } finally {
    isSyncing = false;
    window.dispatchEvent(new Event('sync-end'));
  }
}

async function syncBatch(operations: PendingOperation[]): Promise<{ success: boolean; error?: string }[]> {
  try {
    const response = await fetch('/api/sync/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        operations: operations.map(op => ({
          operationId: op.id,
          type: op.type,
          payload: op.payload,
          timestamp: op.timestamp,
          branchId: op.branchId,
          userId: op.userId
        }))
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Sync failed' }));
      return operations.map(() => ({ success: false, error: error.error || 'Sync failed' }));
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error('Batch sync error:', error);
    return operations.map(() => ({ success: false, error: 'Network error' }));
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function startAutoSync(intervalMs: number = 30000): () => void {
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      syncPendingOperations();
    }
  }, intervalMs);

  const handleOnline = () => {
    console.log('Connection restored, starting sync...');
    setTimeout(() => syncPendingOperations(), 1000);
  };

  window.addEventListener('online', handleOnline);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener('online', handleOnline);
  };
}
