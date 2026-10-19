import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PendingOperation {
  id: string;
  type: 'CHECKIN' | 'CHECKOUT' | 'SALE' | 'RETURN' | 'EXPENSE' | 'PAYMENT' | 'NEW_SUBSCRIPTION' | 'RENEW_SUBSCRIPTION' | 'FREEZE_SUBSCRIPTION' | 'UNFREEZE_SUBSCRIPTION' | 'NEW_MEMBER' | 'DELETE_MEMBER' | 'NEW_PLAN' | 'EDIT_PLAN' | 'TOGGLE_PLAN' | 'EDIT_EXPENSE' | 'DELETE_EXPENSE';
  payload: Record<string, unknown>;
  timestamp: number;
  branchId: string;
  userId: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  error?: string;
  retryCount: number;
}

export interface CachedMember {
  id: string;
  memberCode: string;
  name: string;
  phone: string;
  branchId: string;
  hasActiveSubscription: boolean;
  cachedAt: number;
}

export interface CachedProduct {
  id: string;
  name: string;
  nameAr?: string;
  barcode?: string;
  sku?: string;
  pricePiasters: number;
  quantity: number;
  lowStockThreshold: number;
  branchId: string;
  cachedAt: number;
}

interface Power111DB extends DBSchema {
  pendingOperations: {
    key: string;
    value: PendingOperation;
    indexes: {
      'by-status': string;
      'by-branch': string;
      'by-timestamp': number;
    };
  };
  cachedMembers: {
    key: string;
    value: CachedMember;
    indexes: {
      'by-code': string;
      'by-branch': string;
      'by-cachedAt': number;
    };
  };
  cachedProducts: {
    key: string;
    value: CachedProduct;
    indexes: {
      'by-branch': string;
      'by-cachedAt': number;
    };
  };
  appSettings: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
}

let dbInstance: IDBPDatabase<Power111DB> | null = null;

export async function getDB(): Promise<IDBPDatabase<Power111DB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<Power111DB>('power111-offline', 3, {
    // Every store is guarded by name instead of by version number: a database left
    // behind by an older build can be missing one store, and the old version check
    // then never recreates it, which threw NotFoundError on every page load.
    upgrade(db) {
      if (!db.objectStoreNames.contains('pendingOperations')) {
        const opsStore = db.createObjectStore('pendingOperations', { keyPath: 'id' });
        opsStore.createIndex('by-status', 'status');
        opsStore.createIndex('by-branch', 'branchId');
        opsStore.createIndex('by-timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('cachedMembers')) {
        const membersStore = db.createObjectStore('cachedMembers', { keyPath: 'id' });
        membersStore.createIndex('by-code', 'memberCode');
        membersStore.createIndex('by-branch', 'branchId');
        membersStore.createIndex('by-cachedAt', 'cachedAt');
      }
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('cachedProducts')) {
        const productsStore = db.createObjectStore('cachedProducts', { keyPath: 'id' });
        productsStore.createIndex('by-branch', 'branchId');
        productsStore.createIndex('by-cachedAt', 'cachedAt');
      }
    }
  });

  return dbInstance;
}

export async function addPendingOperation(op: Omit<PendingOperation, 'status' | 'retryCount'>): Promise<void> {
  const db = await getDB();
  await db.put('pendingOperations', {
    ...op,
    status: 'pending',
    retryCount: 0
  });
}

export async function getPendingOperations(branchId?: string): Promise<PendingOperation[]> {
  const db = await getDB();
  if (branchId) {
    return db.getAllFromIndex('pendingOperations', 'by-branch', branchId);
  }
  return db.getAll('pendingOperations');
}

export async function getPendingOperationsCount(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('pendingOperations');
  return all.filter(op => op.status === 'pending' || op.status === 'failed').length;
}

export async function updateOperationStatus(
  id: string,
  status: PendingOperation['status'],
  error?: string
): Promise<void> {
  const db = await getDB();
  const op = await db.get('pendingOperations', id);
  if (op) {
    op.status = status;
    if (error) op.error = error;
    if (status === 'failed') op.retryCount++;
    await db.put('pendingOperations', op);
  }
}

export async function removeOperation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pendingOperations', id);
}

export async function clearCompletedOperations(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll('pendingOperations');
  for (const op of all) {
    if (op.status === 'completed') {
      await db.delete('pendingOperations', op.id);
    }
  }
}

export async function cacheMembers(members: CachedMember[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cachedMembers', 'readwrite');
  for (const member of members) {
    await tx.store.put({ ...member, cachedAt: Date.now() });
  }
  await tx.done;
}

export async function getCachedMember(code: string): Promise<CachedMember | undefined> {
  const db = await getDB();
  const all = await db.getAllFromIndex('cachedMembers', 'by-code', code);
  return all[0];
}

export async function getCachedMembersForBranch(branchId: string): Promise<CachedMember[]> {
  const db = await getDB();
  return db.getAllFromIndex('cachedMembers', 'by-branch', branchId);
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('appSettings', { key, value, updatedAt: Date.now() });
}

export async function getAppSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const entry = await db.get('appSettings', key);
  return entry?.value as T | undefined;
}

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cachedProducts', 'readwrite');
  for (const product of products) {
    await tx.store.put({ ...product, cachedAt: Date.now() });
  }
  await tx.done;
}

export async function getCachedProductsForBranch(branchId: string): Promise<CachedProduct[]> {
  const db = await getDB();
  return db.getAllFromIndex('cachedProducts', 'by-branch', branchId);
}

export async function clearCachedProductsForBranch(branchId: string): Promise<void> {
  const db = await getDB();
  const all = await db.getAllFromIndex('cachedProducts', 'by-branch', branchId);
  const tx = db.transaction('cachedProducts', 'readwrite');
  for (const product of all) {
    await tx.store.delete(product.id);
  }
  await tx.done;
}
