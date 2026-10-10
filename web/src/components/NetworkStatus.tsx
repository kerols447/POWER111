import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useEffect, useState } from 'react';
import { getPendingOperationsCount } from '../utils/offlineDb';

export function NetworkStatus() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      getPendingOperationsCount().then(setPendingCount);
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

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
        isOnline
          ? 'bg-green-600 text-white'
          : 'bg-red-600 text-white'
      }`}
    >
      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-300' : 'bg-red-300 animate-pulse'}`} />

      {!isOnline ? (
        <>
          <span>غير متصل</span>
          {pendingCount > 0 && (
            <span className="bg-red-800 px-2 py-0.5 rounded-full text-xs">
              {pendingCount} عملية معلقة
            </span>
          )}
        </>
      ) : (
        <>
          {isSyncing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>جاري المزامنة...</span>
            </>
          ) : (
            <>
              <span>متصل</span>
              {pendingCount > 0 && (
                <span className="bg-green-800 px-2 py-0.5 rounded-full text-xs">
                  {pendingCount} عملية في الانتظار
                </span>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
