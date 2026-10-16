// Shared types and utilities for POWER 111

// ========== Money Utilities ==========
// All money stored as integer piasters (EGP × 100)

export function piastersToEGP(piasters: number): number {
  return piasters / 100;
}

export function egpToPiasters(egp: number): number {
  return Math.round(egp * 100);
}

export function formatCurrency(piasters: number): string {
  const egp = piastersToEGP(piasters);
  return `${egp.toLocaleString('ar-EG')} ج.م`;
}

// ========== Member Code Generation ==========
// Random, non-sequential, 8 characters, no confusing chars (0/O, 1/I/l)

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function generateMemberCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ========== Validation ==========

export function normalizePhone(phone: string): string {
  // Remove all non-digits, handle Egyptian phone format
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('20')) return digits;
  if (digits.startsWith('0')) return '2' + digits;
  return '2' + digits; // assume Egypt
}

export function isValidEgyptianPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^201[0-9]{9}$/.test(normalized);
}

// ========== Date Utilities ==========

export const CAIRO_TZ = 'Africa/Cairo';

export function getCairoNow(): Date {
  return new Date();
}

export function getCairoToday(): Date {
  const now = new Date();
  const cairoDate = now.toLocaleDateString('en-CA', { timeZone: CAIRO_TZ });
  return new Date(cairoDate + 'T00:00:00');
}

export function isExpiringSoon(endDate: Date, daysThreshold: number = 7): boolean {
  const now = getCairoToday();
  const diff = endDate.getTime() - now.getTime();
  return diff > 0 && diff <= daysThreshold * 24 * 60 * 60 * 1000;
}

// ========== Types ==========

export type Role = 'OWNER' | 'BRANCH_MANAGER' | 'RECEPTIONIST' | 'ACCOUNTANT' | 'CONTENT_MANAGER';

export type MemberStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'FROZEN' | 'INACTIVE';

export const MEMBER_STATUSES: MemberStatus[] = ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'FROZEN', 'INACTIVE'];

// The "موقوف / مجمد" card filters two states at once, so members filters accept a comma list.
export function parseMemberStatusFilter(raw: unknown): { equals?: MemberStatus; in?: MemberStatus[] } | null {
  const list = String(raw ?? '')
    .split(',')
    .map(part => part.trim().toUpperCase())
    .filter((part): part is MemberStatus => (MEMBER_STATUSES as string[]).includes(part));
  if (!list.length) return null;
  return list.length === 1 ? { equals: list[0] } : { in: list };
}

export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'FROZEN' | 'CANCELLED' | 'PENDING_REVIEW';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
