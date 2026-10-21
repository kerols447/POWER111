import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useEffect, useState } from 'react';
import { getPendingOperationsCount } from '../utils/offlineDb';
import { syncPendingOperations } from '../utils/syncEngine';

export function NetworkStatus() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      getPendingOperationsCount().then(setPendingCount).catch(() => setPendingCount(0));
    };

    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncEnd = () => setIsSyncing(false);

    window.addEventListener('sync-start', handleSyncStart);
    window.addEventListener('sync-end', handleSyncEnd);

    return () => {
      window.removeEventListener('sync-start', handleSyncStart);
      window.removeEventListener('sync-end', handleSyncEnd);
    };
  }, []);

  const handleManualSync = async () => {
    if (isSyncing || !isOnline) return;
    await syncPendingOperations();
  };

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg shadow-black/40 text-sm font-medium transition-colors ${
        isOnline
          ? 'bg-dark-card border-dark-border text-gray-200'
          : 'bg-dark-card border-primary/40 text-primary'
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-primary animate-pulse'}`} />

      {!isOnline ? (
        <>
          <span>غير متصل</span>
          {pendingCount > 0 && (
            <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-lg text-[11px] font-bold">
              {pendingCount} عملية معلقة
            </span>
          )}
        </>
      ) : (
        <>
          {isSyncing ? (
            <>
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>جاري المزامنة...</span>
            </>
          ) : (
            <>
              <span>متصل</span>
              {pendingCount > 0 && (
                <>
                  <span className="bg-white/5 text-gray-300 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                    {pendingCount} عملية في الانتظار
                  </span>
                  <button
                    onClick={handleManualSync}
                    className="ml-2 px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors"
                    title="مزامنة الآن"
                  >
                    ↻
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
