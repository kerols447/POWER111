import { cacheMembers, cacheProducts } from './offlineDb';

const PREFETCH_INTERVAL_MS = 15 * 60 * 1000;

async function prefetchBranch(branchId: string): Promise<void> {
  const [membersRes, productsRes] = await Promise.all([
    fetch(`/api/members?branchId=${branchId}&pageSize=500`, { credentials: 'include' }),
    fetch(`/api/products?branchId=${branchId}&active=true`, { credentials: 'include' })
  ]);

  const membersData = await membersRes.json().catch(() => null);
  if (membersData?.data) {
    await cacheMembers(
      membersData.data.map((m: any) => ({
        id: m.id,
        memberCode: m.memberCode,
        name: m.person?.name || m.name,
        phone: m.person?.phone || m.phone,
        branchId: m.branchId,
        hasActiveSubscription: m.hasActiveSubscription ?? false,
        cachedAt: Date.now()
      }))
    );
  }

  const productsData = await productsRes.json().catch(() => null);
  if (productsData?.success && Array.isArray(productsData.data)) {
    await cacheProducts(
      productsData.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        barcode: p.barcode,
        pricePiasters: p.pricePiasters,
        quantity: p.quantity,
        lowStockThreshold: p.lowStockThreshold,
        branchId,
        cachedAt: Date.now()
      }))
    );
  }
}

export async function prefetchOfflineData(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    const res = await fetch('/api/branches', { credentials: 'include' });
    const data = await res.json();
    const branches = Array.isArray(data) ? data : data.branches || [];

    for (const branch of branches) {
      await prefetchBranch(branch.id);
    }
  } catch {
    // Warm-up is best effort; pages still cache on visit
  }
}

export function startOfflinePrefetch(intervalMs: number = PREFETCH_INTERVAL_MS): () => void {
  prefetchOfflineData();

  const intervalId = setInterval(() => {
    if (navigator.onLine) prefetchOfflineData();
  }, intervalMs);

  return () => clearInterval(intervalId);
}
