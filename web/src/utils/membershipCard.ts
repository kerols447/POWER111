import JsBarcode from 'jsbarcode';

export const CARD_WIDTH = 1050;
export const CARD_HEIGHT = 660;

export interface MembershipCardData {
  memberName: string;
  memberCode: string;
  branchName: string;
  planName: string;
  validUntil: string;
  isActive: boolean;
  qrDataUrl: string;
}

const GOLD = '#F59E0B';
const INK = '#FFFFFF';
const MUTED = '#9CA3AF';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function barcodeCanvas(code: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, {
    format: 'CODE128',
    width: 5,
    height: 56,
    displayValue: false,
    margin: 0,
    background: '#FFFFFF',
    lineColor: '#0A0A0A'
  });
  return canvas;
}

const UI_FONT = '"Segoe UI", Tahoma, Arial, sans-serif';
const MONO_FONT = '"Courier New", monospace';

/** Shrinks the font until the text fits the available column width. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: string,
  startPx: number,
  family = UI_FONT
) {
  let px = startPx;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > 16 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
}

/** Draws the membership card onto the given canvas at 1050x660. */
export async function drawMembershipCard(
  canvas: HTMLCanvasElement,
  data: MembershipCardData
): Promise<void> {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const [logo, qr] = await Promise.all([
    loadImage('/power-logo.jpg'),
    loadImage(data.qrDataUrl)
  ]);
  const barcode = barcodeCanvas(data.memberCode);

  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 20, 20, CARD_WIDTH - 40, CARD_HEIGHT - 40, 28);
  ctx.stroke();

  ctx.textBaseline = 'middle';

  // ===== Header: club identity (left) + status pill (right) =====
  ctx.drawImage(logo, 54, 48, 88, 88);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `700 40px ${UI_FONT}`;
  ctx.fillText('POWER 111', 158, 78);
  ctx.fillStyle = MUTED;
  ctx.font = `400 21px ${UI_FONT}`;
  ctx.fillText('POWER 111 GYM — MEMBERSHIP CARD', 158, 114);

  const statusText = data.isActive ? 'نشط' : 'منتهي';
  const statusColor = data.isActive ? '#10B981' : '#F43F5E';
  ctx.direction = 'rtl';
  ctx.font = `700 24px ${UI_FONT}`;
  const statusWidth = ctx.measureText(statusText).width + 46;
  ctx.fillStyle = statusColor;
  roundedRect(ctx, CARD_WIDTH - 54 - statusWidth, 66, statusWidth, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#0A0A0A';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, CARD_WIDTH - 54 - statusWidth / 2, 93);

  ctx.fillStyle = GOLD;
  ctx.fillRect(54, 160, CARD_WIDTH - 108, 3);

  // ===== QR panel =====
  const qrSize = 226;
  const qrX = 54;
  const qrY = 188;
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, qrX, qrY, qrSize, qrSize, 16);
  ctx.fill();
  ctx.drawImage(qr, qrX + 12, qrY + 12, qrSize - 24, qrSize - 24);

  // ===== Member identity block (right column, RTL) =====
  const textRight = CARD_WIDTH - 54;
  const textMaxW = textRight - (qrX + qrSize + 44);
  ctx.textAlign = 'right';

  ctx.direction = 'rtl';
  ctx.fillStyle = INK;
  fitFont(ctx, data.memberName, textMaxW, '700', 44);
  ctx.fillText(data.memberName, textRight, 232);

  ctx.direction = 'ltr';
  ctx.fillStyle = GOLD;
  ctx.font = `700 32px ${MONO_FONT}`;
  ctx.fillText(data.memberCode, textRight, 284);

  ctx.direction = 'rtl';
  ctx.fillStyle = MUTED;
  ctx.font = `400 24px ${UI_FONT}`;
  ctx.fillText(`فرع ${data.branchName}`, textRight, 330);
  fitFont(ctx, `الباقة: ${data.planName}`, textMaxW, '400', 24);
  ctx.fillText(`الباقة: ${data.planName}`, textRight, 366);
  ctx.fillStyle = INK;
  ctx.font = `600 24px ${UI_FONT}`;
  ctx.fillText(`صالح حتى ${data.validUntil}`, textRight, 402);

  // ===== Barcode band =====
  const bcWidth = 600;
  const bcHeight = 104;
  const bcX = (CARD_WIDTH - bcWidth) / 2;
  const bcY = 432;
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, bcX, bcY, bcWidth, bcHeight, 16);
  ctx.fill();
  const scale = Math.min((bcWidth - 48) / barcode.width, 56 / barcode.height);
  const drawW = barcode.width * scale;
  const drawH = barcode.height * scale;
  ctx.drawImage(barcode, bcX + (bcWidth - drawW) / 2, bcY + 14, drawW, drawH);
  ctx.fillStyle = '#0A0A0A';
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.font = `600 22px ${MONO_FONT}`;
  ctx.fillText(data.memberCode, bcX + bcWidth / 2, bcY + bcHeight - 14);

  // ===== Footer =====
  ctx.fillStyle = GOLD;
  ctx.fillRect(54, 558, CARD_WIDTH - 108, 3);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = `400 21px ${UI_FONT}`;
  ctx.fillText('اعرض الكود على الماسح عند الاستقبال لتسجيل الحضور', CARD_WIDTH - 54, 586);
  ctx.fillStyle = INK;
  ctx.font = `600 23px ${UI_FONT}`;
  ctx.fillText('POWER 111 — لياقة • صحة • تغذية', CARD_WIDTH - 54, 620);
}

function triggerDownload(blobUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadCardAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('png encode failed'));
        return;
      }
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve();
    }, 'image/png');
  });
}

/**
 * Wraps the card in a single-page PDF sized to a standard 85.6 x 54 mm bank card,
 * so it prints at true size without any extra library.
 */
export async function downloadCardAsPdf(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const base64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  const binary = atob(base64);
  const imageBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) imageBytes[i] = binary.charCodeAt(i);

  // Card size in points: 85.6mm x 54mm
  const pageW = 242.65;
  const pageH = 153.07;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    position += bytes.byteLength;
  };
  const markObject = () => { offsets.push(position); };

  push('%PDF-1.4\n');
  markObject();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  markObject();
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  markObject();
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
    `/Resources << /XObject << /Im0 5 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 4 0 R >>\nendobj\n`
  );
  markObject();
  const content = encoder.encode(`q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`);
  push(`4 0 obj\n<< /Length ${content.byteLength} >>\nstream\n`);
  push(content);
  push('\nendstream\nendobj\n');
  markObject();
  push(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${CARD_WIDTH} /Height ${CARD_HEIGHT} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`
  );
  push(imageBytes);
  push('\nendstream\nendobj\n');

  const xrefPosition = position;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  offsets.forEach(offset => {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;
  push(xref);

  const blob = new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
