import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import JsBarcode from 'jsbarcode';

interface Product {
  id: string;
  branchId: string;
  name: string;
  nameAr?: string;
  sku?: string;
  barcode?: string;
  image?: string;
  pricePiasters: number;
  costPiasters?: number;
  quantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  branch: { name: string; code: string };
}

interface Branch { id: string; name: string; code: string }

const PlusIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>);
const PackageIcon = () => (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>);
const BoxIcon = () => (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>);
const SearchIcon = () => (<svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>);
const EditIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>);
const TrashIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>);
const StockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>);
const AlertIcon = () => (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>);
const FilterIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>);
const CloseIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>);
const BarcodeIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5v14m3-14v14m3-14v14m2 0v-14m3 0v14m2-14v14m3-14v14" /></svg>);
const PrinterIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>);
const CameraIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>);

function BarcodeSvg({ value, height = 50 }: { value: string; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'EAN13', displayValue: true, fontSize: 14, height,
          background: 'transparent', lineColor: '#ffffff', margin: 0,
          valid: () => true,
        });
      } catch {
        try {
          JsBarcode(svgRef.current, value, {
            format: 'CODE128', displayValue: true, fontSize: 14, height,
            background: 'transparent', lineColor: '#ffffff', margin: 0,
          });
        } catch { /* skip */ }
      }
    }
  }, [value, height]);
  return <svg ref={svgRef} className="w-full" />;
}

function BarcodePrintModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const handlePrint = () => {
    const el = document.getElementById('barcode-print-area');
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html dir="rtl"><head><title>باركود - ${product.nameAr || product.name}</title>
      <style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
      .label{text-align:center;border:1px dashed #ccc;padding:20px;border-radius:8px;display:inline-block}
      .name{font-size:14px;font-weight:bold;margin-bottom:8px}
      .price{font-size:12px;color:#666;margin-top:8px}
      svg{max-width:250px}
      @media print{body{padding:0}.label{border:1px dashed #999}.no-print{display:none}}</style></head>
      <body><div class="label"><div class="name">${product.nameAr || product.name}</div>
      ${el.innerHTML}<div class="price">${(product.pricePiasters / 100).toFixed(2)} جنيه</div></div>
      <div class="no-print" style="margin-top:20px"><button onclick="window.print()" style="padding:8px 24px;cursor:pointer;border-radius:6px;border:1px solid #ccc;background:#f5f5f5">طباعة</button></div>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="relative bg-gradient-to-br from-dark-card via-dark-card to-dark-card rounded-2xl border border-dark-border/50 max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-amber-400 to-primary rounded-t-2xl" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center"><BarcodeIcon /></div>
              <h2 className="text-lg font-bold text-white">طباعة الباركود</h2>
            </div>
            <button onClick={onClose} className="w-10 h-10 shrink-0 rounded-lg bg-dark-hover/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"><CloseIcon /></button>
          </div>
          <div className="bg-white/5 rounded-xl p-6 mb-6">
            <p className="text-center text-sm text-gray-300 mb-3 font-medium">{product.nameAr || product.name}</p>
            <div id="barcode-print-area" className="flex justify-center">
              {product.barcode ? <BarcodeSvg value={product.barcode} height={60} /> : <p className="text-gray-500 text-sm">لا يوجد باركود</p>}
            </div>
            <p className="text-center text-sm text-amber-400 mt-3 font-semibold">{(product.pricePiasters / 100).toFixed(2)} جنيه</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handlePrint} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl">
              <PrinterIcon /> طباعة
            </button>
            <button onClick={onClose} className="flex-1 px-5 py-2.5 bg-dark-hover/50 hover:bg-dark-hover text-white rounded-xl font-medium transition-all duration-200 border border-dark-border/30">إغلاق</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { user, isOwner } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  const [formData, setFormData] = useState({ name: '', nameAr: '', sku: '', barcode: '', pricePiasters: 0, costPiasters: 0, quantity: 0, lowStockThreshold: 5 });
  const [stockData, setStockData] = useState({ type: 'INCOMING', quantity: 0, notes: '' });

  useEffect(() => { fetchBranches(); }, []);
  useEffect(() => { if (selectedBranch) fetchProducts(); }, [selectedBranch, search, lowStockOnly]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.branches || []);
      setBranches(list);
      if (list.length > 0 && !selectedBranch) setSelectedBranch(list[0].id);
    } catch (e) { console.error('Error fetching branches:', e); }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ branchId: selectedBranch });
      if (search) params.append('search', search);
      if (lowStockOnly) params.append('lowStock', 'true');
      const res = await fetch(`/api/products?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } catch (e) { console.error('Error fetching products:', e); }
    finally { setLoading(false); }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { alert('حجم الصورة يجب أن لا يتجاوز 5 ميجابايت'); return; }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', nameAr: '', sku: '', barcode: '', pricePiasters: 0, costPiasters: 0, quantity: 0, lowStockThreshold: 5 });
    setImageFile(null); setImagePreview('');
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name, nameAr: product.nameAr || '', sku: product.sku || '',
      barcode: product.barcode || '', pricePiasters: product.pricePiasters,
      costPiasters: product.costPiasters || 0, quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold
    });
    setImageFile(null);
    setImagePreview(product.image ? product.image : '');
    setShowModal(true);
  };

  const openStockModal = (product: Product) => {
    setStockProduct(product);
    setStockData({ type: 'INCOMING', quantity: 0, notes: '' });
    setShowStockModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...formData, branchId: selectedBranch })
      });
      const data = await res.json();
      if (data.success) {
        if (imageFile) {
          const fd = new FormData();
          fd.append('image', imageFile);
          await fetch(`/api/products/${data.data.id}/image`, { method: 'POST', credentials: 'include', body: fd });
        }
        setShowModal(false); setImageFile(null); setImagePreview('');
        fetchProducts();
      } else { alert(data.error || 'حدث خطأ'); }
    } catch (e) { console.error('Error saving product:', e); alert('فشل في حفظ المنتج'); }
    finally { setUploading(false); }
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockProduct) return;
    try {
      const res = await fetch(`/api/products/${stockProduct.id}/stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(stockData)
      });
      const data = await res.json();
      if (data.success) { setShowStockModal(false); fetchProducts(); }
      else { alert(data.error || 'حدث خطأ'); }
    } catch (e) { console.error('Error adjusting stock:', e); alert('فشل في تعديل المخزون'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) fetchProducts();
      else alert(data.error || 'حدث خطأ');
    } catch (e) { console.error('Error deleting product:', e); alert('فشل في حذف المنتج'); }
  };

  const formatPrice = (p: number) => `${(p / 100).toFixed(2)} جنيه`;
  const isLowStock = (p: Product) => p.quantity <= p.lowStockThreshold;
  const lowStockCount = products.filter(p => isLowStock(p)).length;
  const activeCount = products.filter(p => p.isActive).length;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-card to-amber-950/20 rounded-2xl border border-dark-border p-4 sm:p-6">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <PackageIcon />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">المنتجات والمخزون</h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{products.length} منتج</p>
            </div>
          </div>
          <button onClick={openAddModal} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5">
            <PlusIcon /> إضافة منتج
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-card to-amber-950/10 rounded-2xl border border-dark-border p-4 sm:p-5">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><PackageIcon /></div>
            <div><p className="text-xs text-gray-400">إجمالي المنتجات</p><p className="text-2xl font-bold text-white">{products.length}</p></div>
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-card to-emerald-950/10 rounded-2xl border border-dark-border p-4 sm:p-5">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.06),transparent_50%)]" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><BoxIcon /></div>
            <div><p className="text-xs text-gray-400">المنتجات النشطة</p><p className="text-2xl font-bold text-emerald-400">{activeCount}</p></div>
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-card to-rose-950/10 rounded-2xl border border-dark-border p-4 sm:p-5">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.06),transparent_50%)]" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center"><AlertIcon /></div>
            <div><p className="text-xs text-gray-400">مخزون منخفض</p><p className="text-2xl font-bold text-rose-400">{lowStockCount}</p></div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-card to-amber-950/10 rounded-2xl border border-dark-border p-4 sm:p-5">
        <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
        <div className="flex items-center gap-2 mb-4 relative"><FilterIcon /><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">التصفية والبحث</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative">
          {!singleBranchUser && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">الفرع</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200">
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">بحث</label>
            <div className="relative">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم المنتج، الباركود، SKU..." className="w-full pl-10 pr-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
              <div className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></div>
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer group py-2.5 px-4 bg-dark border border-dark-border rounded-xl w-full hover:border-primary/30 transition-all duration-200">
              <div className="relative">
                <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} className="sr-only peer" />
                <div className="w-5 h-5 rounded-md border-2 border-white/25 peer-checked:border-primary peer-checked:bg-primary transition-all duration-200 flex items-center justify-center">
                  {lowStockOnly && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">المخزون المنخفض فقط</span>
            </label>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="relative overflow-hidden bg-gradient-to-br from-dark-card/80 via-dark-card/60 to-dark-card/80 rounded-2xl border border-dark-border">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center gap-3 text-gray-400">
              <svg className="animate-spin w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              جاري التحميل...
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-dark-hover/30 flex items-center justify-center"><PackageIcon /></div>
            <p className="text-gray-400 text-lg font-medium">لا توجد منتجات</p>
            <p className="text-gray-500 text-sm mt-1">قم بإضافة منتج جديد للبدء</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border/50">
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">المنتج</th>
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الباركود / SKU</th>
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">السعر</th>
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الكمية</th>
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الحالة</th>
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/30">
                  {products.map(product => (
                    <tr key={product.id} className="hover:bg-primary/5 transition-colors duration-200 group">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-dark-hover/30 flex-shrink-0 flex items-center justify-center border border-dark-border/50">
                            {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                              : <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                          </div>
                          <div>
                            <div className="text-white font-medium group-hover:text-primary transition-colors">{product.nameAr || product.name}</div>
                            <div className="text-sm text-gray-500">{product.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {product.barcode ? (
                          <button onClick={() => setBarcodeProduct(product)} className="flex items-center gap-2 text-sm text-gray-300 hover:text-primary transition-colors">
                            <BarcodeIcon /><span className="font-mono">{product.barcode}</span>
                          </button>
                        ) : <span className="text-gray-600">—</span>}
                        {product.sku && <div className="text-xs text-gray-500 font-mono mt-0.5">{product.sku}</div>}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm font-semibold text-white">{formatPrice(product.pricePiasters)}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className={`text-sm font-bold ${isLowStock(product) ? 'text-rose-400' : 'text-white'}`}>{product.quantity}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {isLowStock(product) ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-full border border-rose-500/20">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                              منخفض
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-300 rounded-full border border-emerald-500/20">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                              متوفر
                            </span>
                          )}
                          {!product.isActive && <span className="px-2.5 py-1 text-xs font-medium bg-dark-hover/50 text-gray-400 rounded-full border border-dark-border/30">معطل</span>}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          {product.barcode && (
                            <button onClick={() => setBarcodeProduct(product)} className="inline-flex items-center gap-1 px-2.5 py-2 min-h-10 text-xs font-medium bg-primary/10 text-amber-300 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all duration-200" title="طباعة الباركود">
                              <PrinterIcon />
                            </button>
                          )}
                          <button onClick={() => openStockModal(product)} className="inline-flex items-center gap-1 px-2.5 py-2 min-h-10 text-xs font-medium bg-emerald-500/10 text-emerald-300 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all duration-200"><StockIcon /></button>
                          <button onClick={() => openEditModal(product)} className="inline-flex items-center gap-1 px-2.5 py-2 min-h-10 text-xs font-medium bg-primary/10 text-amber-300 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all duration-200"><EditIcon /></button>
                          <button onClick={() => handleDelete(product.id)} className="inline-flex items-center gap-1 px-2.5 py-2 min-h-10 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all duration-200"><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-dark-border/30">
              {products.map(product => (
                <div key={product.id} className="p-4 hover:bg-primary/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-dark-hover/30 flex-shrink-0 flex items-center justify-center border border-dark-border/50">
                      {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        : <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-white truncate">{product.nameAr || product.name}</h3>
                          <p className="text-xs text-gray-500 truncate">{product.name}</p>
                        </div>
                        <span className={`text-sm font-bold flex-shrink-0 ${isLowStock(product) ? 'text-rose-400' : 'text-white'}`}>{product.quantity}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm font-semibold text-primary">{formatPrice(product.pricePiasters)}</span>
                        {isLowStock(product) && <span className="px-2 py-0.5 text-[11px] font-medium bg-rose-500/10 text-rose-300 rounded-full border border-rose-500/20">منخفض</span>}
                        {!product.isActive && <span className="px-2 py-0.5 text-[11px] font-medium bg-dark-hover/50 text-gray-400 rounded-full">معطل</span>}
                      </div>
                      {product.barcode && (
                        <button onClick={() => setBarcodeProduct(product)} className="flex items-center gap-1.5 mt-1 min-h-10 text-xs text-gray-400 hover:text-primary transition-colors">
                          <BarcodeIcon /><span className="font-mono">{product.barcode}</span>
                        </button>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {product.barcode && (
                          <button onClick={() => setBarcodeProduct(product)} className="inline-flex items-center gap-1 px-3 py-2 min-h-10 text-xs font-medium bg-primary/10 text-amber-300 rounded-lg border border-primary/20"><PrinterIcon />باركود</button>
                        )}
                        <button onClick={() => openStockModal(product)} className="inline-flex items-center gap-1 px-3 py-2 min-h-10 text-xs font-medium bg-emerald-500/10 text-emerald-300 rounded-lg border border-emerald-500/20"><StockIcon />مخزون</button>
                        <button onClick={() => openEditModal(product)} className="inline-flex items-center gap-1 px-3 py-2 min-h-10 text-xs font-medium bg-primary/10 text-amber-300 rounded-lg border border-primary/20"><EditIcon />تعديل</button>
                        <button onClick={() => handleDelete(product.id)} className="inline-flex items-center gap-1 px-3 py-2 min-h-10 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20"><TrashIcon /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowModal(false)}>
          <div className="relative bg-gradient-to-br from-dark-card via-dark-card to-dark-card rounded-2xl border border-dark-border max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-gradient-to-b from-dark-card to-dark-card/95 p-5 sm:p-6 pb-0 border-b border-dark-border/50">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-t-2xl" />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-lg shadow-primary/20"><PackageIcon /></div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
                </div>
                <button onClick={() => setShowModal(false)} className="w-10 h-10 shrink-0 rounded-lg bg-dark-hover/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"><CloseIcon /></button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 pt-4 space-y-5">
              {/* Image Upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">صورة المنتج</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-dark-border overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-dark flex-shrink-0" onClick={() => fileInputRef.current?.click()}>
                    {imagePreview ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                      : <div className="text-center"><CameraIcon /><p className="text-[11px] text-gray-500 mt-1">اختر صورة</p></div>}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-2">PNG, JPG, WEBP (حد أقصى 5MB)</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3.5 min-h-11 py-2 text-xs font-medium bg-primary/10 text-amber-300 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all">
                        {imagePreview ? 'تغيير' : 'رفع صورة'}
                      </button>
                      {imagePreview && (
                        <button type="button" onClick={removeImage} className="px-3.5 min-h-11 py-2 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all">إزالة</button>
                      )}
                    </div>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleImageChange} className="hidden" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">الاسم بالعربية *</label>
                  <input type="text" required value={formData.nameAr} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">الاسم بالإنجليزية *</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">الباركود</label>
                  <div className="relative">
                    <input type="text" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} placeholder="اتركه فارغاً للإنشاء تلقائي" className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"><BarcodeIcon /></div>
                  </div>
                  {!editingProduct && !formData.barcode && <p className="text-[11px] text-primary/60 mt-1">سيتم إنشاء باركود EAN-13 تلقائياً</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">SKU</label>
                  <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">سعر البيع (جنيه) *</label>
                  <input type="number" required min="0" step="0.01" value={formData.pricePiasters / 100} onChange={e => setFormData({ ...formData, pricePiasters: Math.round(parseFloat(e.target.value) * 100) })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">سعر التكلفة (جنيه)</label>
                  <input type="number" min="0" step="0.01" value={formData.costPiasters / 100} onChange={e => setFormData({ ...formData, costPiasters: Math.round(parseFloat(e.target.value) * 100) })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
                {!editingProduct && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">الكمية الابتدائية</label>
                    <input type="number" min="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">حد المخزون المنخفض</label>
                  <input type="number" min="1" value={formData.lowStockThreshold} onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 5 })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={uploading} className="flex-1 px-5 py-2.5 bg-gradient-to-r from-primary to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed">
                  {uploading ? 'جاري الحفظ...' : (editingProduct ? 'تحديث' : 'إضافة')}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-5 py-2.5 bg-dark-hover/50 hover:bg-dark-hover text-white rounded-xl font-medium transition-all duration-200 border border-dark-border/30">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showStockModal && stockProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowStockModal(false)}>
          <div className="relative bg-gradient-to-br from-dark-card via-dark-card to-dark-card rounded-2xl border border-dark-border max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent rounded-t-2xl" />
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center"><StockIcon /></div>
                  <div><h2 className="text-lg font-bold text-white">تعديل المخزون</h2><p className="text-sm text-gray-400">{stockProduct.nameAr || stockProduct.name}</p></div>
                </div>
                <button onClick={() => setShowStockModal(false)} className="w-10 h-10 shrink-0 rounded-lg bg-dark-hover/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"><CloseIcon /></button>
              </div>
              <div className="relative overflow-hidden mb-6 p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">الكمية الحالية</span>
                  <span className="text-3xl font-bold text-emerald-400">{stockProduct.quantity}</span>
                </div>
              </div>
              <form onSubmit={handleStockAdjust} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">نوع الحركة *</label>
                  <select required value={stockData.type} onChange={e => setStockData({ ...stockData, type: e.target.value })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200">
                    <option value="INCOMING">وارد (إضافة)</option>
                    <option value="ADJUSTMENT">تعديل (سحب/إضافة)</option>
                    <option value="RETURN">مرتجع</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">الكمية *</label>
                  <input type="number" required min="1" value={stockData.quantity} onChange={e => setStockData({ ...stockData, quantity: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">ملاحظات</label>
                  <textarea value={stockData.notes} onChange={e => setStockData({ ...stockData, notes: e.target.value })} rows={3} className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200 resize-none" placeholder="أضف ملاحظة (اختياري)..." />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="flex-1 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-xl">تأكيد</button>
                  <button type="button" onClick={() => setShowStockModal(false)} className="flex-1 px-5 py-2.5 bg-dark-hover/50 hover:bg-dark-hover text-white rounded-xl font-medium transition-all duration-200 border border-dark-border/30">إلغاء</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Print Modal */}
      {barcodeProduct && <BarcodePrintModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />}
    </div>
  );
}
