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
  // Staff shift cards reuse the same artwork with staff wording.
  kind?: 'member' | 'staff';
  subtitle?: string;
}

const WHITE = '#FFFFFF';
const INK = '#0A0A0A';
const MUTED = 'rgba(255, 255, 255, 0.55)';
const FAINT = 'rgba(255, 255, 255, 0.20)';
const EDGE = 'rgba(255, 255, 255, 0.72)';


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

// One module (the thinnest bar) is measured first so the bars can be laid out at a whole
// pixel width: a 2-character code prints wide and bold, an 8-character code stays crisp.
function barcodeCanvas(code: string, targetWidth: number, barHeight: number): HTMLCanvasElement {
  const draw = (moduleWidth: number, height: number) => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: moduleWidth,
      height,
      displayValue: false,
      margin: 0,
      background: '#FFFFFF',
      lineColor: INK
    });
    return canvas;
  };
  const modules = draw(1, 8).width;
  return draw(Math.max(2, Math.floor((targetWidth - 2) / modules)), barHeight);
}

const UI_FONT = '"Segoe UI", Tahoma, Arial, sans-serif';
const MONO_FONT = '"Courier New", monospace';
const BLACK_FONT = '"Arial Black", "Segoe UI", Arial, sans-serif';

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

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}

/** Latin small-caps style labels get wide letter spacing, like the mockup. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'right' | 'center' = 'left'
) {
  const previous = ctx.textAlign;
  const width = trackedWidth(ctx, text, spacing);
  let cursor = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = previous;
  return width;
}

/** White circle with a black glyph — the club's fitness / health / nutrition marks. */
function iconCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, kind: 'dumbbell' | 'heart' | 'leaf') {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = WHITE;
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  const s = r / 27;
  ctx.scale(s, s);

  if (kind === 'dumbbell') {
    ctx.fillRect(-10, -3, 20, 6);
    ctx.fillRect(-15, -10, 6, 20);
    ctx.fillRect(9, -10, 6, 20);
    ctx.fillRect(-21, -7, 5, 14);
    ctx.fillRect(16, -7, 5, 14);
  } else if (kind === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.bezierCurveTo(-3, -12, -16, -11, -16, -1);
    ctx.bezierCurveTo(-16, 8, -3, 13, 0, 18);
    ctx.bezierCurveTo(3, 13, 16, 8, 16, -1);
    ctx.bezierCurveTo(16, -11, 3, -12, 0, -3);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-11, 14);
    ctx.bezierCurveTo(-13, -2, -1, -16, 12, -15);
    ctx.bezierCurveTo(11, -1, 3, 11, -11, 14);
    ctx.fill();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-9, 12);
    ctx.quadraticCurveTo(0, 0, 10, -13);
    ctx.stroke();
  }
  ctx.restore();
}

/** The double diagonal slash that sits in the card corners. */
function cornerAccent(ctx: CanvasRenderingContext2D, x: number, y: number, dirX: number, dirY: number) {
  ctx.lineCap = 'butt';
  ctx.lineWidth = 9;
  for (const offset of [0, 26]) {
    const startX = x + dirX * offset;
    const endX = startX + dirX * 52;
    const endY = y + dirY * 52;
    const gradient = ctx.createLinearGradient(startX, y, endX, endY);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.18)');
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
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

  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const L = 54;
  const R = W - 54;
  const isStaff = data.kind === 'staff';

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 2;
  roundedRect(ctx, 22, 22, W - 44, H - 44, 26);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';

  // ===== Brand block (top-left) =====
  ctx.fillStyle = WHITE;
  ctx.font = `900 58px ${BLACK_FONT}`;
  drawTracked(ctx, 'POWER 111', L, 74, 2);

  const circleR = 27;
  const circleY = 144;
  iconCircle(ctx, L + circleR, circleY, circleR, 'dumbbell');
  iconCircle(ctx, L + circleR + 70, circleY, circleR, 'heart');
  iconCircle(ctx, L + circleR + 140, circleY, circleR, 'leaf');

  // ===== Card type (top-right) =====
  cornerAccent(ctx, W - 58, 26, -1, 1);

  ctx.fillStyle = WHITE;
  ctx.font = `600 26px ${UI_FONT}`;
  const typeWidth = drawTracked(ctx, isStaff ? 'STAFF CARD' : 'MEMBERSHIP CARD', R, 96, 5, 'right');
  const ruleGradient = ctx.createLinearGradient(R - typeWidth, 0, R, 0);
  ruleGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  ruleGradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)');
  ruleGradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
  ctx.fillStyle = ruleGradient;
  ctx.fillRect(R - typeWidth, 120, typeWidth, 2);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = `400 22px ${UI_FONT}`;
  ctx.fillText(isStaff ? 'بطاقة موظف' : 'بطاقة عضوية', R, 150);

  ctx.fillStyle = FAINT;
  ctx.fillRect(L, 196, R - L, 1);

  // ===== Member name =====
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `500 20px ${UI_FONT}`;
  drawTracked(ctx, isStaff ? 'STAFF NAME' : 'MEMBER NAME', L, 224, 5);

  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE;
  fitFont(ctx, data.memberName, R - L, '700', 46);
  ctx.fillText(data.memberName, L, 266);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(L, 298, R - L, 2);

  // ===== ID / branch columns =====
  ctx.direction = 'ltr';
  ctx.fillStyle = MUTED;
  ctx.font = `500 18px ${UI_FONT}`;
  drawTracked(ctx, isStaff ? 'STAFF ID' : 'MEMBERSHIP ID', L, 336, 4);
  drawTracked(ctx, 'BRANCH', 556, 336, 4);

  ctx.fillStyle = WHITE;
  ctx.font = `700 34px ${MONO_FONT}`;
  ctx.fillText(data.memberCode, L, 376);

  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  fitFont(ctx, data.branchName, R - 556, '700', 32);
  ctx.fillText(data.branchName, 556, 376);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(520, 316);
  ctx.lineTo(520, 396);
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `400 22px ${UI_FONT}`;
  const planLine = data.subtitle || `الباقة: ${data.planName}   •   صالح حتى ${data.validUntil}`;
  fitFont(ctx, planLine, R - L - 170, '400', 22);
  ctx.fillText(planLine, L, 420);

  const statusText = isStaff ? (data.isActive ? 'مُفعّل' : 'متوقف') : (data.isActive ? 'نشط' : 'منتهي');
  const statusColor = data.isActive ? '#10B981' : '#F43F5E';
  ctx.font = `700 21px ${UI_FONT}`;
  const statusWidth = ctx.measureText(statusText).width + 54;
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = 2;
  roundedRect(ctx, R - statusWidth, 400, statusWidth, 40, 20);
  ctx.stroke();
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(R - statusWidth + 18, 420, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.fillText(statusText, R - statusWidth / 2 + 9, 421);

  // ===== Barcode band — the printed card scans from this alone =====
  // The white panel runs edge to edge on purpose: bars that sit inside a white window on a
  // black card cannot be read (the dark card body merges into the first bar), only this layout
  // scans from the reception camera and from a hand-held laser.
  const bandY = 452;
  const bandH = 142;
  const barHeight = 80;
  const barcode = barcodeCanvas(data.memberCode, R - L - 88, barHeight);
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, bandY, W, bandH);
  ctx.drawImage(barcode, Math.round(L + (R - L - barcode.width) / 2), bandY + 14);

  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 30px ${MONO_FONT}`;
  drawTracked(ctx, data.memberCode, (L + R) / 2, bandY + bandH - 26, 7, 'center');

  // ===== Footer =====
  cornerAccent(ctx, W - 58, H - 26, -1, -1);

  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `400 20px ${UI_FONT}`;
  ctx.fillText(isStaff ? 'امسح الباركود عند الاستقبال لختم الدخول والخروج' : 'امسح الباركود عند الاستقبال لتسجيل الحضور', L, 616);

  ctx.direction = 'ltr';
  ctx.fillStyle = MUTED;
  ctx.font = `500 19px ${UI_FONT}`;
  const scanWidth = drawTracked(ctx, 'SCAN TO CHECK IN', R - 134, 616, 4, 'right');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(R - 134 - scanWidth - 44, 615, 32, 2);
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
