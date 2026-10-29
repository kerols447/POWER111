import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import JsBarcode from 'jsbarcode';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';
import { elementText, openPrintWindow } from '../utils/printDocument';
import {
  PageHeader, StatTile, SectionTitle, Badge, Btn, Picker, SearchField, Toggle,
  TableShell, Th, Td, Row, ListCard, EmptyState, Loading, Modal, Field,
  UiIcon, CARD, FIELD, TONE
} from '../components/ui';
import { Stagger } from '../components/Motion';

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

// The kit has no stock-movement or camera glyph yet — these two stay local until it does.
const StockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>);
const CameraIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 01-2 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>);

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
    const area = document.getElementById('barcode-print-area');
    if (!area) return;
    const barcode = area.querySelector('svg');

    openPrintWindow({
      title: `باركود - ${product.nameAr || product.name}`,
      css: `body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
      .label{text-align:center;border:1px dashed #ccc;padding:20px;border-radius:8px;display:inline-block}
      .name{font-size:14px;font-weight:bold;margin-bottom:8px}
      .price{font-size:12px;color:#666;margin-top:8px}
      svg{max-width:250px}
      @media print{body{padding:0}.label{border:1px dashed #999}}`,
      build: (doc) => {
        const label = doc.createElement('div');
        label.className = 'label';
        label.appendChild(elementText(doc, 'div', 'name', product.nameAr || product.name));
        if (barcode) label.appendChild(doc.importNode(barcode, true));
        label.appendChild(elementText(doc, 'div', 'price', `${(product.pricePiasters / 100).toFixed(2)} جنيه`));
        return [label];
      }
    })?.print();
  };

  return (
    <Modal
      open
      width="max-w-sm"
      title="طباعة الباركود"
      onClose={onClose}
      footer={
        <>
          <Btn variant="primary" icon="print" onClick={handlePrint}>طباعة</Btn>
          <Btn type="button" variant="ghost" onClick={onClose}>إغلاق</Btn>
        </>
      }
    >
      <div className="bg-white/5 rounded-xl p-6">
        <p className="text-center text-sm text-gray-300 mb-3 font-semibold">{product.nameAr || product.name}</p>
        <div id="barcode-print-area" className="flex justify-center">
          {product.barcode ? <BarcodeSvg value={product.barcode} height={60} /> : <p className="text-gray-500 text-sm">لا يوجد باركود</p>}
        </div>
        <p className="text-center text-sm text-primary mt-3 font-semibold">{(product.pricePiasters / 100).toFixed(2)} جنيه</p>
      </div>
    </Modal>
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
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

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
      if (file.size > 5 * 1024 * 1024) { setNotice({ kind: 'err', text: 'حجم الصورة يجب أن لا يتجاوز 5 ميجابايت' }); return; }
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
      } else { setNotice({ kind: 'err', text: data.error || 'حدث خطأ' }); }
    } catch (e) { console.error('Error saving product:', e); setNotice({ kind: 'err', text: 'فشل في حفظ المنتج' }); }
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
      else { setNotice({ kind: 'err', text: data.error || 'حدث خطأ' }); }
    } catch (e) { console.error('Error adjusting stock:', e); setNotice({ kind: 'err', text: 'فشل في تعديل المخزون' }); }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const id = pendingDelete.id;
    const productName = pendingDelete.name;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setNotice({ kind: 'ok', text: `تم حذف المنتج "${productName}"` });
        fetchProducts();
      } else {
        setNotice({ kind: 'err', text: data.error || 'حدث خطأ' });
      }
    } catch (e) {
      console.error('Error deleting product:', e);
      setNotice({ kind: 'err', text: 'فشل في حذف المنتج' });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const formatPrice = (p: number) => `${(p / 100).toFixed(2)} جنيه`;
  const isLowStock = (p: Product) => p.quantity <= p.lowStockThreshold;
  const lowStockCount = products.filter(p => isLowStock(p)).length;
  const activeCount = products.filter(p => p.isActive).length;

  return (
    <Stagger className="space-y-5 sm:space-y-7" dir="rtl">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <PageHeader
        icon="products"
        title="المنتجات والمخزون"
        caption={`${products.length} منتج`}
        tone={TONE.products}
        actions={
          <Btn icon="plus" variant="primary" onClick={openAddModal}>إضافة منتج</Btn>
        }
      />

      {/* Summary Tiles — every tile reads the whole fetched branch dataset */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="products"
          tone={TONE.products}
          label="إجمالي المنتجات"
          value={products.length}
        />
        <StatTile
          icon="check"
          tone={TONE.revenue}
          label="المنتجات النشطة"
          value={activeCount}
        />
        <StatTile
          icon="warning"
          tone={TONE.expenses}
          label="مخزون منخفض"
          value={lowStockCount}
        />
      </div>

      {/* Filters */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="mb-4">
          <SectionTitle tone={TONE.products}>التصفية والبحث</SectionTitle>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {!singleBranchUser && (
            <Picker
              value={selectedBranch}
              onChange={(v) => setSelectedBranch(v)}
              ariaLabel="الفرع"
              className="w-full"
              options={branches.map(b => ({ value: b.id, label: b.name }))}
            />
          )}
          <SearchField
            value={search}
            onChange={(v) => setSearch(v)}
            placeholder="اسم المنتج، الباركود، SKU..."
            className="w-full"
          />
          <div className="bg-dark-card border border-dark-border rounded-xl px-4 flex items-center justify-between gap-3">
            <Toggle
              checked={lowStockOnly}
              onChange={(v) => setLowStockOnly(v)}
              label="المخزون المنخفض فقط"
            />
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className={`${CARD} overflow-hidden`}>
        {loading ? (
          <Loading />
        ) : products.length === 0 ? (
          <EmptyState
            icon="products"
            title="لا توجد منتجات"
            hint="قم بإضافة منتج جديد للبدء"
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <TableShell
                minWidth="min-w-[760px]"
                head={
                  <>
                    <Th>المنتج</Th>
                    <Th>الباركود / SKU</Th>
                    <Th>السعر</Th>
                    <Th>الكمية</Th>
                    <Th>الحالة</Th>
                    <Th>إجراءات</Th>
                  </>
                }
              >
                {products.map(product => (
                  <Row key={product.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-dark flex-shrink-0 flex items-center justify-center border border-dark-border">
                          {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                            : <UiIcon name="products" className="w-5 h-5 text-gray-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">{product.nameAr || product.name}</div>
                          <div className="text-sm text-gray-500">{product.name}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {product.barcode ? (
                        <button onClick={() => setBarcodeProduct(product)} className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-[36px] text-sm text-gray-300 hover:text-primary transition-colors">
                          <UiIcon name="barcode" className="w-4 h-4" />
                          <span className="font-mono">{product.barcode}</span>
                        </button>
                      ) : <span className="text-gray-600">—</span>}
                      {product.sku && <div className="text-xs text-gray-500 font-mono mt-0.5">{product.sku}</div>}
                    </Td>
                    <Td>
                      <span className="text-sm font-semibold text-white">{formatPrice(product.pricePiasters)}</span>
                    </Td>
                    <Td>
                      <span className={`text-sm font-bold ${isLowStock(product) ? 'text-rose-400' : 'text-white'}`}>{product.quantity}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {isLowStock(product) ? (
                          <Badge tone="red">
                            <UiIcon name="warning" className="w-3 h-3" />
                            منخفض
                          </Badge>
                        ) : (
                          <Badge tone="green">
                            <UiIcon name="check" className="w-3 h-3" />
                            متوفر
                          </Badge>
                        )}
                        {!product.isActive && <Badge tone="gray">معطل</Badge>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {product.barcode && (
                          <button onClick={() => setBarcodeProduct(product)} title="طباعة الباركود" className="inline-flex items-center justify-center w-9 min-h-[44px] sm:min-h-[36px] bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors">
                            <UiIcon name="print" className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => openStockModal(product)} title="تعديل المخزون" className="inline-flex items-center justify-center w-9 min-h-[44px] sm:min-h-[36px] bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                          <StockIcon />
                        </button>
                        <button onClick={() => openEditModal(product)} title="تعديل المنتج" className="inline-flex items-center justify-center w-9 min-h-[44px] sm:min-h-[36px] bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors">
                          <UiIcon name="edit" className="w-4 h-4" />
                        </button>
                        <button onClick={() => setPendingDelete(product)} title="حذف المنتج" className="inline-flex items-center justify-center w-9 min-h-[44px] sm:min-h-[36px] bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-colors">
                          <UiIcon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </Td>
                  </Row>
                ))}
              </TableShell>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden p-3 space-y-3">
              {products.map(product => (
                <ListCard key={product.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-dark flex-shrink-0 flex items-center justify-center border border-dark-border">
                      {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        : <UiIcon name="products" className="w-6 h-6 text-gray-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white truncate">{product.nameAr || product.name}</h3>
                          <p className="text-xs text-gray-500 truncate">{product.name}</p>
                        </div>
                        <span className={`text-sm font-bold flex-shrink-0 ${isLowStock(product) ? 'text-rose-400' : 'text-white'}`}>{product.quantity}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-sm font-semibold text-primary">{formatPrice(product.pricePiasters)}</span>
                        {isLowStock(product) && (
                          <Badge tone="red">
                            <UiIcon name="warning" className="w-3 h-3" />
                            منخفض
                          </Badge>
                        )}
                        {!product.isActive && <Badge tone="gray">معطل</Badge>}
                      </div>
                      {product.barcode && (
                        <button onClick={() => setBarcodeProduct(product)} className="inline-flex items-center gap-1.5 mt-1 min-h-[44px] text-xs text-gray-400 hover:text-primary transition-colors">
                          <UiIcon name="barcode" className="w-4 h-4" />
                          <span className="font-mono">{product.barcode}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-border/30">
                    {product.barcode && (
                      <button onClick={() => setBarcodeProduct(product)} className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                        <UiIcon name="print" className="w-3.5 h-3.5" />
                        باركود
                      </button>
                    )}
                    <button onClick={() => openStockModal(product)} className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                      <StockIcon />
                      مخزون
                    </button>
                    <button onClick={() => openEditModal(product)} className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                      <UiIcon name="edit" className="w-3.5 h-3.5" />
                      تعديل
                    </button>
                    <Btn variant="danger" size="sm" icon="trash" onClick={() => setPendingDelete(product)} title="حذف المنتج" className="px-3 min-h-[44px]">
                      حذف
                    </Btn>
                  </div>
                </ListCard>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        width="max-w-2xl"
        title={editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Btn type="submit" form="product-form" variant="primary" disabled={uploading}>
              {uploading ? 'جاري الحفظ...' : (editingProduct ? 'تحديث' : 'إضافة')}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => setShowModal(false)}>إلغاء</Btn>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Image Upload */}
          <Field label="صورة المنتج">
            <div className="flex items-center gap-4">
              <div
                className="w-24 h-24 rounded-xl border-2 border-dashed border-dark-border overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-dark flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  : <div className="text-center"><CameraIcon /><p className="text-[11px] text-gray-500 mt-1">اختر صورة</p></div>}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-2">PNG, JPG, WEBP (حد أقصى 5MB)</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3.5 min-h-[44px] py-2 text-xs font-semibold bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors">
                    {imagePreview ? 'تغيير' : 'رفع صورة'}
                  </button>
                  {imagePreview && (
                    <button type="button" onClick={removeImage} className="px-3.5 min-h-[44px] py-2 text-xs font-semibold bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-colors">إزالة</button>
                  )}
                </div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleImageChange} className="hidden" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Field label="الاسم بالعربية" required>
              <input type="text" required value={formData.nameAr} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} className={FIELD} />
            </Field>
            <Field label="الاسم بالإنجليزية" required>
              <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={FIELD} />
            </Field>
            <Field
              label="الباركود"
              hint={!editingProduct && !formData.barcode ? 'سيتم إنشاء باركود EAN-13 تلقائياً' : undefined}
            >
              <div className="relative">
                <input type="text" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} placeholder="اتركه فارغاً للإنشاء تلقائي" className={`${FIELD} pl-10`} />
                <UiIcon name="barcode" className="w-4 h-4 text-gray-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </Field>
            <Field label="SKU">
              <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} className={FIELD} />
            </Field>
            <Field label="سعر البيع (جنيه)" required>
              <input type="number" required min="0" step="0.01" value={formData.pricePiasters / 100} onChange={e => setFormData({ ...formData, pricePiasters: Math.round(parseFloat(e.target.value) * 100) })} className={FIELD} />
            </Field>
            <Field label="سعر التكلفة (جنيه)">
              <input type="number" min="0" step="0.01" value={formData.costPiasters / 100} onChange={e => setFormData({ ...formData, costPiasters: Math.round(parseFloat(e.target.value) * 100) })} className={FIELD} />
            </Field>
            {!editingProduct && (
              <Field label="الكمية الابتدائية">
                <input type="number" min="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} className={FIELD} />
              </Field>
            )}
            <Field label="حد المخزون المنخفض">
              <input type="number" min="1" value={formData.lowStockThreshold} onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 5 })} className={FIELD} />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Stock Adjustment Modal */}
      {showStockModal && stockProduct && (
        <Modal
          open
          width="max-w-md"
          title="تعديل المخزون"
          subtitle={stockProduct.nameAr || stockProduct.name}
          onClose={() => setShowStockModal(false)}
          footer={
            <>
              <Btn type="submit" form="stock-form" variant="primary">تأكيد</Btn>
              <Btn type="button" variant="ghost" onClick={() => setShowStockModal(false)}>إلغاء</Btn>
            </>
          }
        >
          <div className={`${CARD} p-4 flex items-center justify-between`}>
            <span className="text-sm text-gray-400">الكمية الحالية</span>
            <span className="text-3xl font-extrabold text-emerald-400">{stockProduct.quantity}</span>
          </div>
          <form id="stock-form" onSubmit={handleStockAdjust} className="space-y-4">
            <Field label="نوع الحركة" required>
              <Picker
                value={stockData.type}
                onChange={(v) => setStockData({ ...stockData, type: v })}
                ariaLabel="نوع الحركة"
                className="w-full"
                options={[
                  { value: 'INCOMING', label: 'وارد (إضافة)' },
                  { value: 'ADJUSTMENT', label: 'تعديل (سحب/إضافة)' },
                  { value: 'RETURN', label: 'مرتجع' }
                ]}
              />
            </Field>
            <Field label="الكمية" required>
              <input type="number" required min="1" value={stockData.quantity} onChange={e => setStockData({ ...stockData, quantity: parseInt(e.target.value) || 0 })} className={FIELD} />
            </Field>
            <Field label="ملاحظات">
              <textarea value={stockData.notes} onChange={e => setStockData({ ...stockData, notes: e.target.value })} rows={3} placeholder="أضف ملاحظة (اختياري)..." className={`${FIELD} resize-none`} />
            </Field>
          </form>
        </Modal>
      )}

      {/* Barcode Print Modal */}
      {barcodeProduct && <BarcodePrintModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المنتج"
        description={pendingDelete ? `هل أنت متأكد من حذف هذا المنتج؟ "${pendingDelete.name}" (${formatPrice(pendingDelete.pricePiasters)})` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Stagger>
  );
}
