export function normalizeWhatsAppPhone(phone: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0020')) return digits.slice(2);
  if (digits.startsWith('01') && digits.length === 11) return `20${digits.slice(1)}`;
  if (digits.startsWith('2') && digits.length === 12) return digits;
  if (digits.length === 10 && digits.startsWith('1')) return `20${digits}`;

  return null;
}

export function whatsappLink(phone: string, message?: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;

  return message
    ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${normalized}`;
}
