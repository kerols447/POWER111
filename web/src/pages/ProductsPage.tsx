import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  const [formData, setFormData] = useState({
    name: '',
    nameAr: '',
    sku: '',
    barcode: '',
    pricePiasters: 0,
    costPiasters: 0,
    quantity: 0,
    lowStockThreshold: 5
  });

  const [stockData, setStockData] = useState({
    type: 'INCOMING',
    quantity: 0,
    notes: ''
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch) {
      fetchProducts();
    }
  }, [selectedBranch, search, lowStockOnly]);

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
    setLoading(true);
    try {
      const params = new URLSearchParams({ branchId: selectedBranch });
      if (search) params.append('search', search);
      if (lowStockOnly) params.append('lowStock', 'true');

      const res = await fetch(`/api/products?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      nameAr: '',
      sku: '',
      barcode: '',
      pricePiasters: 0,
      costPiasters: 0,
      quantity: 0,
      lowStockThreshold: 5
    });
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      nameAr: product.nameAr || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      pricePiasters: product.pricePiasters,
      costPiasters: product.costPiasters || 0,
      quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold
    });
    setShowModal(true);
  };

  const openStockModal = (product: Product) => {
    setStockProduct(product);
    setStockData({
      type: 'INCOMING',
      quantity: 0,
      notes: ''
    });
    setShowStockModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          branchId: selectedBranch
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        fetchProducts();
      } else {
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      alert('فشل في حفظ المنتج');
    }
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stockProduct) return;

    try {
      const res = await fetch(`/api/products/${stockProduct.id}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(stockData)
      });

      const data = await res.json();
      if (data.success) {
        setShowStockModal(false);
        fetchProducts();
      } else {
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error adjusting stock:', error);
      alert('فشل في تعديل المخزون');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await res.json();
      if (data.success) {
        fetchProducts();
      } else {
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('فشل في حذف المنتج');
    }
  };

  const formatPrice = (piasters: number) => {
    const egp = piasters / 100;
    return `${egp.toFixed(2)} جنيه`;
  };

  const isLowStock = (product: Product) => {
    return product.quantity <= product.lowStockThreshold;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">المنتجات والمخزون</h1>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          إضافة منتج جديد
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Branch Selector */}
          {!singleBranchUser && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                الفرع
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              بحث
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم المنتج، الباركود، SKU..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Low Stock Filter */}
          <div className="flex items-end">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                className="w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="mr-2 text-sm font-medium text-gray-300">
                عرض المخزون المنخفض فقط
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            لا توجد منتجات. قم بإضافة منتج جديد للبدء.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    المنتج
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    الباركود / SKU
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    السعر
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    الكمية
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    الحالة
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">
                        {product.nameAr || product.name}
                      </div>
                      <div className="text-sm text-gray-400">{product.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {product.barcode && <div className="text-sm">{product.barcode}</div>}
                      {product.sku && <div className="text-sm text-gray-400">{product.sku}</div>}
                      {!product.barcode && !product.sku && <span className="text-gray-500">-</span>}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {formatPrice(product.pricePiasters)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${isLowStock(product) ? 'text-red-400' : 'text-white'}`}>
                        {product.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isLowStock(product) ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-900/30 text-red-400 rounded">
                          مخزون منخفض
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-green-900/30 text-green-400 rounded">
                          متوفر
                        </span>
                      )}
                      {!product.isActive && (
                        <span className="mr-2 px-2 py-1 text-xs font-medium bg-gray-700 text-gray-400 rounded">
                          غير مفعل
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openStockModal(product)}
                          className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                        >
                          مخزون
                        </button>
                        <button
                          onClick={() => openEditModal(product)}
                          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name (Arabic) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      الاسم بالعربية *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nameAr}
                      onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Name (English) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      الاسم بالإنجليزية *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Barcode */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      الباركود
                    </label>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* SKU */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      SKU
                    </label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Selling Price */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      سعر البيع (جنيه) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.pricePiasters / 100}
                      onChange={(e) => setFormData({ ...formData, pricePiasters: Math.round(parseFloat(e.target.value) * 100) })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Cost Price */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      سعر التكلفة (جنيه)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.costPiasters / 100}
                      onChange={(e) => setFormData({ ...formData, costPiasters: Math.round(parseFloat(e.target.value) * 100) })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Initial Quantity (only for new products) */}
                  {!editingProduct && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        الكمية الابتدائية
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Low Stock Threshold */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      حد المخزون المنخفض
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.lowStockThreshold}
                      onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 5 })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    {editingProduct ? 'تحديث' : 'إضافة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showStockModal && stockProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                تعديل المخزون - {stockProduct.nameAr || stockProduct.name}
              </h2>

              <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                <div className="text-sm text-gray-400">الكمية الحالية</div>
                <div className="text-2xl font-bold text-white">{stockProduct.quantity}</div>
              </div>

              <form onSubmit={handleStockAdjust} className="space-y-4">
                {/* Movement Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    نوع الحركة *
                  </label>
                  <select
                    required
                    value={stockData.type}
                    onChange={(e) => setStockData({ ...stockData, type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="INCOMING">وارد (إضافة)</option>
                    <option value="ADJUSTMENT">تعديل (سحب/إضافة)</option>
                    <option value="RETURN">مرتجع</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الكمية *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={stockData.quantity}
                    onChange={(e) => setStockData({ ...stockData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    ملاحظات
                  </label>
                  <textarea
                    value={stockData.notes}
                    onChange={(e) => setStockData({ ...stockData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    تأكيد
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStockModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
