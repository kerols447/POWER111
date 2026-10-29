import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  addPendingOperation,
  cacheProducts,
  getCachedProductsForBranch,
} from '../utils/offlineDb';
import {
  PageHeader, Badge, Btn, Segmented, Picker, Field, FIELD,
  TableShell, Th, Td, Row, ListCard, EmptyState, Loading, UiIcon, CARD, TONE, OfflineBanner
} from '../components/ui';
import { Stagger } from '../components/Motion';

/* ─── Local line icons the kit has no equivalent for (same 24 grid, 1.6 stroke, round caps) ─── */
const IconMinus = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.5 12h-15" />
  </svg>
);

const IconWifiOff = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728m12.728-12.728L5.636 18.364M12 20.25v.008M12 20.25v-.008M12 20.25a9 9 0 01-6.398-2.652M12 20.25a9 9 0 006.398-2.652M2.636 2.636L12 12m0 0l9.364 9.364M12 12L2.636 18.364M12 12l9.364-9.364" />
  </svg>
);

const IconCreditCard = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.75 8h18.5" />
    <path d="M4.5 5.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
    <path d="M7.5 15.5h3" />
  </svg>
);

const IconBank = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 9.5 12 4l8.5 5.5" />
    <path d="M6 11v6M12 11v6M18 11v6" />
    <path d="M3.5 20h17" />
  </svg>
);

const IconOther = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" />
  </svg>
);

const IconCamera = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

/* ─── Payment Method Icon Map ─── */
const PaymentIcon = ({ method, className = "w-5 h-5" }: { method: string; className?: string }) => {
  switch (method) {
    case 'CASH': return <UiIcon name="wallet" className={className} />;
    case 'CARD': return <IconCreditCard className={className} />;
    case 'BANK_TRANSFER': return <IconBank className={className} />;
    default: return <IconOther className={className} />;
  }
};

// The slim scrollbar the POS scroll areas use, written with Tailwind arbitrary variants
// instead of a custom CSS class (the app has no hand-written stylesheets).
const SCROLLBAR = '[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb:hover]:bg-white/[0.15]';

interface Product {
  id: string;
  name: string;
  nameAr?: string;
  barcode?: string;
  sku?: string;
  pricePiasters: number;
  quantity: number;
  lowStockThreshold: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Sale {
  id: string;
  invoiceNumber: string;
  totalPiasters: number;
  discountPiasters: number;
  finalTotalPiasters: number;
  paymentMethod: string;
  createdAt: string;
  items: Array<{
    product: {
      name: string;
      nameAr?: string;
    };
    quantity: number;
    unitPricePiasters: number;
    totalPiasters: number;
  }>;
  branch: {
    name: string;
    code: string;
  };
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface ScanToast {
  kind: 'ok' | 'bad';
  title: string;
  message?: string;
  code?: string;
}

// The POS remembers that the camera belongs open, the same way the attendance
// scanner does — the till should never need a click before it can sell.
const POS_AUTO_CAMERA_KEY = 'power111_pos_auto_camera';

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export default function SalesPage() {
  const { user, isOwner } = useAuth();
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<'pos' | 'sales'>('pos');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  // Barcode scanning — the camera and the handheld gun both feed the cart.
  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [autoCamera, setAutoCamera] = useState(() => localStorage.getItem(POS_AUTO_CAMERA_KEY) !== '0');
  const [toast, setToast] = useState<ScanToast | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const scanBufferRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const toastTimerRef = useRef<number | undefined>(undefined);
  const cartRef = useRef<CartItem[]>([]);
  const productsRef = useRef<Product[]>([]);
  const scanRef = useRef<(code: string) => void>(() => {});

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch && activeTab === 'pos') {
      fetchProducts();
    } else if (selectedBranch && activeTab === 'sales') {
      fetchSales();
    }
  }, [selectedBranch, activeTab]);

  useEffect(() => {
    if (selectedBranch && isOnline) {
      prefetchProductsForBranch(selectedBranch);
    }
  }, [selectedBranch, isOnline]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const prefetchProductsForBranch = async (branchId: string) => {
    try {
      const res = await fetch(`/api/products?branchId=${branchId}&active=true`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        await cacheProducts(data.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          nameAr: p.nameAr,
          barcode: p.barcode,
          sku: p.sku,
          pricePiasters: p.pricePiasters,
          quantity: p.quantity,
          lowStockThreshold: p.lowStockThreshold,
          branchId
        })));
      }
    } catch (error) {
      console.error('Error prefetching products:', error);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      if (branchList.length > 0 && !selectedBranch) {
        setSelectedBranch(branchList[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchProducts = async () => {
    if (!isOnline) {
      const cached = await getCachedProductsForBranch(selectedBranch);
      setProducts(cached);
      return;
    }
    try {
      const res = await fetch(`/api/products?branchId=${selectedBranch}&active=true`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        await cacheProducts(data.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          nameAr: p.nameAr,
          barcode: p.barcode,
          sku: p.sku,
          pricePiasters: p.pricePiasters,
          quantity: p.quantity,
          lowStockThreshold: p.lowStockThreshold,
          branchId: selectedBranch
        })));
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      const cached = await getCachedProductsForBranch(selectedBranch);
      if (cached.length > 0) {
        setProducts(cached);
      }
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales?branchId=${selectedBranch}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSales(data.data);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  // Every cart write goes through here so the refs the scanner reads stay true —
  // a scan can land between renders and must never be dropped or doubled.
  const applyCart = (next: CartItem[]) => {
    cartRef.current = next;
    setCart(next);
  };

  const pushToCart = (product: Product): 'ok' | 'stock' => {
    const existing = cartRef.current.find(item => item.product.id === product.id);
    if (existing && existing.quantity >= product.quantity) return 'stock';
    applyCart(existing
      ? cartRef.current.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
            : item
        )
      : [...cartRef.current, {
          product,
          quantity: 1,
          unitPrice: product.pricePiasters,
          total: product.pricePiasters
        }]
    );
    return 'ok';
  };

  const addToCart = (product: Product) => {
    if (pushToCart(product) === 'stock') {
      flash({ kind: 'bad', title: 'الكمية غير كافية في المخزون', message: productName(product) });
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const product = productsRef.current.find(p => p.id === productId);
    if (product && quantity > product.quantity) {
      flash({ kind: 'bad', title: 'الكمية غير كافية في المخزون', message: `المتاح ${product.quantity} فقط` });
      return;
    }

    applyCart(cartRef.current.map(item =>
      item.product.id === productId
        ? { ...item, quantity, total: quantity * item.unitPrice }
        : item
    ));
  };

  const removeFromCart = (productId: string) => {
    applyCart(cartRef.current.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    applyCart([]);
    setDiscount(0);
    setNotes('');
  };

  /* ─── Barcode scanning ─── */
  const productName = (p: Product) => p.nameAr || p.name;

  // A handheld scanner is a keyboard: it types the code then presses Enter. Listening on
  // the document means the cashier scans the second the product is in hand, without
  // clicking into anything. A modal on screen always wins — the gun must never fire behind a form.
  const acceptCode = (raw: string) => {
    const code = raw.trim();
    if (!code) return false;
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last.code === code && now - last.at < 4000) return false;
    lastCodeRef.current = { code, at: now };
    return true;
  };

  const beep = (kind: 'ok' | 'bad') => {
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioRef.current || (audioRef.current = new Ctor());
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = kind === 'ok' ? 880 : 320;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // No audio is never a reason to lose a sale.
    }
  };

  const flash = (result: ScanToast) => {
    setToast(result);
    beep(result.kind);
    if (navigator.vibrate) navigator.vibrate(result.kind === 'ok' ? 120 : [100, 50, 100]);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), result.kind === 'ok' ? 2400 : 3600);
  };

  // Matched on the printed barcode first, then on the SKU — the two codes a product can carry.
  const findProductByCode = (raw: string) => {
    const code = raw.trim().toLowerCase();
    if (!code) return undefined;
    const list = productsRef.current;
    return list.find(p => p.barcode?.trim().toLowerCase() === code)
        || list.find(p => p.sku?.trim().toLowerCase() === code);
  };

  const handleScannedCode = (raw: string) => {
    if (!acceptCode(raw)) return;
    const product = findProductByCode(raw);
    if (!product) {
      flash({ kind: 'bad', title: 'الكود ده مش من منتجاتنا', message: raw.trim(), code: raw.trim() });
      return;
    }
    if (product.quantity <= 0) {
      flash({ kind: 'bad', title: 'نفد من المخزون', message: productName(product) });
      return;
    }
    if (pushToCart(product) === 'stock') {
      flash({ kind: 'bad', title: 'الكمية غير كافية في المخزون', message: `المتاح ${product.quantity} فقط` });
      return;
    }
    flash({ kind: 'ok', title: productName(product), message: `${formatPrice(product.pricePiasters)} • أُضيف إلى السلة` });
  };

  useEffect(() => {
    scanRef.current = handleScannedCode;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      const buf = scanBufferRef.current;
      const now = Date.now();
      if (now - buf.at > 150) buf.text = '';
      buf.at = now;

      if (e.key === 'Enter') {
        if (!buf.text.trim()) return;
        e.preventDefault();
        scanRef.current(buf.text);
        buf.text = '';
        return;
      }
      if (e.key.length !== 1) return;
      buf.text += e.key;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const startScanner = async () => {
    setScannerError(null);
    setScanning(true);

    // The region only exists after React paints the scanner panel, and the auto-arm
    // timer fires before that commit — html5-qrcode throws on a missing node.
    for (let frame = 0; frame < 10 && !document.getElementById('pos-scanner-region'); frame++) {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    }

    try {
      const html5Qrcode = new Html5Qrcode('pos-scanner-region', {
        // Shop barcodes are EAN/UPC plus whatever the label printer emits. Every extra
        // format is another decode pass per frame, so the short list reads faster.
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        // Chrome/Android ship a hardware barcode decoder; use it before falling back to WASM.
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });
      scannerRef.current = html5Qrcode;

      const isMobile = window.innerWidth < 768;
      await html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: isMobile
            ? { width: Math.min(240, window.innerWidth - 90), height: Math.min(160, window.innerWidth - 90) }
            : { width: 280, height: 180 },
          aspectRatio: 1.0
        },
        (decodedText) => scanRef.current(decodedText),
        () => {}
      );
      rememberAutoCamera(true);
    } catch (error) {
      console.error('Error starting POS scanner:', error);
      setScannerError('الكاميرا مش شغالة — جهاز الباركود لسه بيشتغل من غير ضغط');
      setScanning(false);
    }
  };

  const rememberAutoCamera = (on: boolean) => {
    localStorage.setItem(POS_AUTO_CAMERA_KEY, on ? '1' : '0');
    setAutoCamera(on);
  };

  const closeScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // Already stopped, or the tab was swapped before the stream opened.
    }
  };

  const stopScanner = async () => {
    rememberAutoCamera(false);
    await closeScanner();
    setScanning(false);
  };

  // The camera is armed with the tab so the till can sell the moment it opens, and it
  // hands the camera back as soon as the cashier leaves — the light must not stay on.
  useEffect(() => {
    if (activeTab !== 'pos') {
      if (scannerRef.current) {
        closeScanner();
        setScanning(false);
      }
      return;
    }
    if (!autoCamera) return;
    const timer = window.setTimeout(() => {
      if (!scannerRef.current) startScanner();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeTab, autoCamera]);

  useEffect(() => () => { closeScanner(); }, []);

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() - discount;
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      flash({ kind: 'bad', title: 'السلة فارغة', message: 'امسح باركود المنتج أو اضغط عليه لإضافته' });
      return;
    }

    if (!isOnline) {
      await handleOfflineSale();
      return;
    }

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          branchId: selectedBranch,
          items: cart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            pricePiasters: item.unitPrice
          })),
          discountPiasters: discount,
          paymentMethod,
          notes
        })
      });

      const data = await res.json();
      if (data.success) {
        flash({ kind: 'ok', title: 'تمت عملية البيع بنجاح', message: `رقم الفاتورة: ${data.data.invoiceNumber}` });
        clearCart();
        fetchProducts();
        if (activeTab === 'sales') {
          fetchSales();
        }
      } else {
        flash({ kind: 'bad', title: data.error || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error creating sale:', error);
      await handleOfflineSale();
    }
  };

  const handleOfflineSale = async () => {
    const operationId = generateOperationId();
    await addPendingOperation({
      id: operationId,
      type: 'SALE',
      payload: {
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPricePiasters: item.unitPrice
        })),
        discountPiasters: discount,
        paymentMethod,
        notes,
        saleTimestamp: new Date().toISOString()
      },
      timestamp: Date.now(),
      branchId: selectedBranch,
      userId: user!.id
    });

    flash({ kind: 'ok', title: 'تم حفظ عملية البيع محلياً', message: 'هتتزامن لوحدها أول ما الإنترنت يرجع' });
    clearCart();
  };

  const formatPrice = (piasters: number) => {
    const egp = piasters / 100;
    return `${egp.toFixed(2)} جنيه`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.nameAr?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      'CASH': 'نقدي',
      'CARD': 'بطاقة',
      'BANK_TRANSFER': 'تحويل بنكي',
      'OTHER': 'أخرى'
    };
    return labels[method] || method;
  };

  /* ─── Payment method option metadata ─── */
  const paymentOptions = [
    { value: 'CASH', label: 'نقدي', icon: <UiIcon name="wallet" className="w-4 h-4" /> },
    { value: 'CARD', label: 'بطاقة', icon: <IconCreditCard className="w-4 h-4" /> },
    { value: 'BANK_TRANSFER', label: 'تحويل بنكي', icon: <IconBank className="w-4 h-4" /> },
    { value: 'OTHER', label: 'أخرى', icon: <IconOther className="w-4 h-4" /> },
  ];

  return (
    <Stagger className="space-y-5 sm:space-y-7" dir="rtl">

      {/* ══════ Offline Banner ══════ */}
      {!isOnline && <OfflineBanner hint="يمكنك إجراء عمليات البيع وسيتم تزامنها تلقائياً عند عودة الاتصال" />}

      {/* ══════ Header ══════ */}
      <PageHeader
        icon="sales"
        title="المبيعات"
        caption="إدارة عمليات البيع ونقطة البيع"
        actions={
          <Segmented
            value={activeTab}
            onChange={(next) => setActiveTab(next)}
            options={[
              { key: 'pos', label: 'نقطة البيع' },
              { key: 'sales', label: 'سجل المبيعات' }
            ]}
          />
        }
      />

      {/* ══════ Branch Selector ══════ */}
      {!singleBranchUser && (
        <div className={`${CARD} p-4 sm:p-5`}>
          <div className="flex items-start gap-3">
            <span
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center mt-[22px]"
              style={{ backgroundColor: `${TONE.gold}14`, color: TONE.gold }}
            >
              <UiIcon name="branches" className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <Field label="الفرع">
                <div className="sm:max-w-xs">
                  <Picker
                    value={selectedBranch}
                    onChange={(next) => setSelectedBranch(next)}
                    ariaLabel="الفرع"
                    className="w-full"
                    options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                  />
                </div>
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          POS TAB
         ═══════════════════════════════════════════ */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

          {/* ──── Scanner + Products ──── */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">

            {/* ──── Barcode reader ──── */}
            <div className={`${CARD} p-4 sm:p-5 space-y-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${TONE.revenue}14`, color: TONE.revenue }}
                  >
                    <UiIcon name="barcode" className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-extrabold text-white">قارئ الباركود</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">امسح المنتج وهو بيضاف للسلة على طول</p>
                  </div>
                </div>
                {scanning ? (
                  <Btn variant="danger" onClick={stopScanner} className="shrink-0">
                    إيقاف الكاميرا
                  </Btn>
                ) : (
                  <Btn variant="ghost" onClick={startScanner} className="shrink-0">
                    <IconCamera className="w-4 h-4" />
                    <span>تشغيل الكاميرا</span>
                  </Btn>
                )}
              </div>

              {scanning ? (
                <div className="relative mt-1 rounded-2xl overflow-hidden bg-black border border-dark-border">
                  <div id="pos-scanner-region" className="w-full max-w-sm mx-auto" />
                  <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/80 rounded-lg border border-dark-border">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: TONE.revenue }} />
                    <span className="text-xs font-semibold" style={{ color: TONE.revenue }}>يمسح...</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-dark-border bg-dark px-3 py-2.5">
                  <div className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: TONE.revenue }} />
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    جهاز الباركود شغال من غير ضغط — وجّه للمنتج واضغط، الكود يتكتب والمنتج يدخل السلة
                  </p>
                </div>
              )}

              {scannerError && !scanning && (
                <p className="text-[11px] text-rose-400">{scannerError}</p>
              )}
            </div>

            <div className={`${CARD} overflow-hidden`}>
              {/* Panel header */}
              <div className="border-b border-dark-border p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${TONE.gold}14`, color: TONE.gold }}
                    >
                      <UiIcon name="products" className="w-4 h-4" />
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-extrabold text-white">المنتجات</h2>
                      <p className="text-xs text-gray-500">{filteredProducts.length} منتج متاح</p>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative w-full sm:w-64">
                    <UiIcon name="search" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        // A gun aimed at the search box still sells: Enter on a real code
                        // puts the product in the cart instead of only filtering the grid.
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        if (!findProductByCode(searchTerm)) return;
                        const code = searchTerm;
                        setSearchTerm('');
                        handleScannedCode(code);
                      }}
                      placeholder="بحث أو مسح باركود منتج..."
                      className={`${FIELD} pr-10`}
                    />
                  </div>
                </div>
              </div>

              {/* Products Grid */}
              <div className="p-4 sm:p-5">
                <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 max-h-[500px] lg:max-h-[600px] overflow-y-auto pr-1 ${SCROLLBAR}`}>
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-full">
                      <EmptyState icon="search" title="لا توجد منتجات مطابقة" />
                    </div>
                  ) : (
                    filteredProducts.map((product) => {
                      const isOutOfStock = product.quantity === 0;
                      const isLowStock = product.quantity <= product.lowStockThreshold;

                      return (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          disabled={isOutOfStock}
                          className={`relative overflow-hidden rounded-xl border p-3 sm:p-4 min-h-[76px] text-right transition-colors ${
                            isOutOfStock
                              ? 'border-dark-border bg-dark opacity-50 cursor-not-allowed'
                              : 'border-dark-border bg-dark-card hover:border-primary/50 active:bg-dark-hover'
                          }`}
                        >
                          {/* Stock badge */}
                          {isLowStock && !isOutOfStock && (
                            <Badge tone="red" className="absolute top-2 left-2 px-1.5 py-0.5 text-[11px]">
                              مخزون منخفض
                            </Badge>
                          )}
                          {isOutOfStock && (
                            <Badge tone="gray" className="absolute top-2 left-2 px-1.5 py-0.5 text-[11px]">
                              نفد
                            </Badge>
                          )}

                          <div className="relative">
                            <div className="text-white font-semibold text-xs sm:text-sm leading-snug line-clamp-2 mb-2">
                              {product.nameAr || product.name}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-primary font-bold text-sm sm:text-base">
                                {formatPrice(product.pricePiasters)}
                              </span>
                            </div>
                            <div className={`mt-2 flex items-center gap-1 text-[11px] sm:text-xs ${
                              isLowStock ? 'text-rose-400/80' : 'text-gray-500'
                            }`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${
                                isOutOfStock ? 'bg-gray-600' : isLowStock ? 'bg-rose-400' : 'bg-emerald-400'
                              }`} />
                              <span>المخزون: {product.quantity}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ──── Cart Panel ──── */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-4 space-y-4">
              <div className={`${CARD} overflow-hidden`}>
                {/* Cart header */}
                <div className="border-b border-dark-border p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${TONE.sales}14`, color: TONE.sales }}
                      >
                        <UiIcon name="sales" className="w-4 h-4" />
                      </span>
                      <div>
                        <h2 className="text-base sm:text-lg font-extrabold text-white">السلة</h2>
                        <p className="text-xs text-gray-500">
                          {cart.length === 0 ? 'فارغة' : `${cart.length} منتج`}
                        </p>
                      </div>
                    </div>
                    {cart.length > 0 && (
                      <Btn variant="danger" icon="trash" onClick={clearCart} className="shrink-0">
                        <span>مسح</span>
                      </Btn>
                    )}
                  </div>
                </div>

                {/* Cart body */}
                <div className="p-4 sm:p-5">
                  {cart.length === 0 ? (
                    <EmptyState icon="sales" title="السلة فارغة" hint="اختر منتجات من القائمة لإضافتها" />
                  ) : (
                    <>
                      {/* Cart Items */}
                      <div className={`space-y-2.5 max-h-[320px] lg:max-h-[400px] overflow-y-auto pr-1 ${SCROLLBAR}`}>
                        {cart.map((item, index) => (
                          <div
                            key={item.product.id}
                            className="rounded-xl border border-dark-border bg-dark p-3 sm:p-3.5"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-semibold text-xs sm:text-sm truncate">
                                  {item.product.nameAr || item.product.name}
                                </div>
                                <div className="text-primary/80 text-xs mt-0.5">
                                  {formatPrice(item.unitPrice)} / وحدة
                                </div>
                              </div>
                              <button
                                onClick={() => removeFromCart(item.product.id)}
                                className="flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                                title="حذف"
                              >
                                <UiIcon name="trash" className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dark-border bg-dark-card text-gray-400 transition-colors hover:border-primary/50 hover:text-white"
                              >
                                <IconMinus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateCartQuantity(item.product.id, parseInt(e.target.value) || 0)}
                                className="w-14 rounded-lg border border-dark-border bg-dark-card py-2.5 min-h-[44px] text-center text-sm font-semibold text-white transition-colors focus:border-primary/60 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dark-border bg-dark-card text-gray-400 transition-colors hover:border-primary/50 hover:text-white"
                              >
                                <UiIcon name="plus" className="w-4 h-4" />
                              </button>
                              <div className="flex-1 text-left">
                                <span className="text-white text-sm font-bold">
                                  {formatPrice(item.total)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ── Totals Section ── */}
                      <div className="mt-4 rounded-xl border border-dark-border bg-dark p-3 sm:p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">المجموع الفرعي</span>
                          <span className="text-gray-200 font-medium">{formatPrice(calculateSubtotal())}</span>
                        </div>

                        <div className="flex justify-between items-center gap-3">
                          <span className="text-gray-400 text-sm">الخصم</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={discount / 100}
                              onChange={(e) => setDiscount(Math.round(parseFloat(e.target.value) * 100) || 0)}
                              className="w-28 rounded-lg border border-dark-border bg-dark-card py-2.5 min-h-[44px] px-3 text-left text-sm text-white transition-colors focus:border-primary/60 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 pointer-events-none">جنيه</span>
                          </div>
                        </div>

                        {discount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-emerald-400/80">خصم</span>
                            <span className="text-emerald-400 font-medium">- {formatPrice(discount)}</span>
                          </div>
                        )}

                        <div className="border-t border-dark-border pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-base sm:text-lg">الإجمالي</span>
                            <span className="text-primary font-extrabold text-xl sm:text-2xl">
                              {formatPrice(calculateTotal())}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* ── Payment Method ── */}
                      <div className="mt-4">
                        <Field label="طريقة الدفع">
                          <div className="grid grid-cols-2 gap-2">
                            {paymentOptions.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setPaymentMethod(opt.value)}
                                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 min-h-[44px] text-xs sm:text-sm font-semibold transition-colors ${
                                  paymentMethod === opt.value
                                    ? 'bg-primary/10 border-primary/50 text-primary'
                                    : 'bg-dark-card border-dark-border text-gray-400 hover:border-primary/40 hover:text-white'
                                }`}
                              >
                                {opt.icon}
                                <span>{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        </Field>
                      </div>

                      {/* ── Notes ── */}
                      <div className="mt-4">
                        <Field label="ملاحظات">
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="أضف ملاحظات للطلب..."
                            className={`${FIELD} resize-none`}
                          />
                        </Field>
                      </div>

                      {/* ── Action Buttons ── */}
                      <div className="flex gap-2.5 mt-4">
                        <Btn variant="primary" onClick={handleCheckout} className="flex-1">
                          {!isOnline ? (
                            <>
                              <IconWifiOff className="w-5 h-5" />
                              حفظ محلياً
                            </>
                          ) : (
                            <>
                              <UiIcon name="check" className="w-5 h-5" />
                              إتمام البيع
                            </>
                          )}
                        </Btn>
                        <Btn variant="ghost" onClick={clearCart} icon="close" className="px-4 sm:px-5" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          SALES LIST TAB
         ═══════════════════════════════════════════ */}
      {activeTab === 'sales' && (
        <div className={`${CARD} overflow-hidden`}>
          {!isOnline ? (
            <EmptyState
              icon="warning"
              title="غير متصل بالإنترنت"
              hint="سجل المبيعات غير متاح بدون اتصال"
            />
          ) : loading ? (
            <Loading />
          ) : sales.length === 0 ? (
            <EmptyState
              icon="sales"
              title="لا توجد مبيعات"
              hint="ستظهر المبيعات هنا بعد إجراء أول عملية بيع"
            />
          ) : (
            <>
              {/* Mobile: Card view */}
              <div className="block lg:hidden p-3 space-y-3">
                {sales.map((sale) => (
                  <ListCard key={sale.id}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-white font-bold text-sm">{sale.invoiceNumber}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{formatDate(sale.createdAt)}</p>
                      </div>
                      <Badge tone="gold" className="shrink-0">
                        <PaymentIcon method={sale.paymentMethod} className="w-3 h-3" />
                        {getPaymentMethodLabel(sale.paymentMethod)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-dark-border/40">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                        <UiIcon name="products" className="w-3.5 h-3.5" />
                        <span>{sale.items.length} منتج</span>
                      </div>
                      <p className="text-primary font-bold text-base">
                        {formatPrice(sale.finalTotalPiasters)}
                      </p>
                    </div>
                  </ListCard>
                ))}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden lg:block">
                <TableShell
                  minWidth="min-w-[720px]"
                  head={
                    <>
                      <Th>رقم الفاتورة</Th>
                      <Th>التاريخ</Th>
                      <Th>المنتجات</Th>
                      <Th>الإجمالي</Th>
                      <Th>طريقة الدفع</Th>
                    </>
                  }
                >
                  {sales.map((sale) => (
                    <Row key={sale.id}>
                      <Td>
                        <span className="text-white font-semibold text-sm">{sale.invoiceNumber}</span>
                      </Td>
                      <Td>
                        <span className="text-gray-400 text-sm">{formatDate(sale.createdAt)}</span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-dark border border-dark-border px-2.5 py-1 text-xs font-medium text-gray-300">
                          <UiIcon name="products" className="w-3 h-3" />
                          {sale.items.length} منتج
                        </span>
                      </Td>
                      <Td>
                        <span className="text-primary font-bold text-sm">
                          {formatPrice(sale.finalTotalPiasters)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone="gold">
                          <PaymentIcon method={sale.paymentMethod} className="w-3.5 h-3.5" />
                          {getPaymentMethodLabel(sale.paymentMethod)}
                        </Badge>
                      </Td>
                    </Row>
                  ))}
                </TableShell>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════ Scan / result toast ══════ */}
      {toast && createPortal(
        <div
          className={`${CARD} fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,380px)] p-4 shadow-2xl shadow-black/60`}
          style={{ borderColor: `${toast.kind === 'ok' ? TONE.revenue : TONE.expenses}4D` }}
        >
          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: `${toast.kind === 'ok' ? TONE.revenue : TONE.expenses}26`,
                color: toast.kind === 'ok' ? TONE.revenue : TONE.expenses
              }}
            >
              {toast.kind === 'ok' ? <UiIcon name="check" className="w-4 h-4" /> : <UiIcon name="close" className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-bold truncate"
                style={{ color: toast.kind === 'ok' ? TONE.revenue : TONE.expenses }}
              >
                {toast.title}
              </p>
              {toast.message && (
                <p className="text-[11px] text-gray-400 mt-0.5 break-words">{toast.message}</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </Stagger>
  );
}
