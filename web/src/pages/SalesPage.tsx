import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  addPendingOperation,
  cacheProducts,
  getCachedProductsForBranch,
} from '../utils/offlineDb';

interface Product {
  id: string;
  name: string;
  nameAr?: string;
  barcode?: string;
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
    if (!isOnline) return;
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

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) {
        alert('الكمية غير كافية في المخزون');
        return;
      }
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
          : item
      ));
    } else {
      setCart([...cart, {
        product,
        quantity: 1,
        unitPrice: product.pricePiasters,
        total: product.pricePiasters
      }]);
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    if (product && quantity > product.quantity) {
      alert('الكمية غير كافية في المخزون');
      return;
    }

    setCart(cart.map(item =>
      item.product.id === productId
        ? { ...item, quantity, total: quantity * item.unitPrice }
        : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setNotes('');
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() - discount;
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('السلة فارغة');
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
        alert(`تمت عملية البيع بنجاح\nرقم الفاتورة: ${data.data.invoiceNumber}`);
        clearCart();
        fetchProducts();
        if (activeTab === 'sales') {
          fetchSales();
        }
      } else {
        alert(data.error || 'حدث خطأ');
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

    alert('تم حفظ عملية البيع محلياً (سيتم التزامن عند عودة الاتصال)');
    clearCart();
  };

  const formatPrice = (piasters: number) => {
    const egp = piasters / 100;
    return `${egp.toFixed(2)} جنيه`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ar-EG', {
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

  return (
    <div className="space-y-6" dir="rtl">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 text-yellow-400 text-sm">
          غير متصل بالإنترنت — يمكنك إجراء عمليات البيع وسيتم تزامنها تلقائياً عند عودة الاتصال
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">المبيعات</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'pos'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            نقطة البيع
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'sales'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            سجل المبيعات
          </button>
        </div>
      </div>

      {/* Branch Selector */}
      {!singleBranchUser && (
        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            الفرع
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full md:w-1/3 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* POS Tab */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold text-white mb-4">المنتجات</h2>

            {/* Search */}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث عن منتج..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            {/* Products Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.quantity === 0}
                  className={`p-3 rounded-lg text-right transition-colors ${
                    product.quantity === 0
                      ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="text-white font-medium text-sm">
                    {product.nameAr || product.name}
                  </div>
                  <div className="text-blue-400 text-sm mt-1">
                    {formatPrice(product.pricePiasters)}
                  </div>
                  <div className={`text-xs mt-1 ${
                    product.quantity <= product.lowStockThreshold
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}>
                    المخزون: {product.quantity}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold text-white mb-4">السلة</h2>

            {cart.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                السلة فارغة
              </div>
            ) : (
              <>
                {/* Cart Items */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                  {cart.map((item) => (
                    <div key={item.product.id} className="bg-gray-700 rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-white font-medium text-sm">
                            {item.product.nameAr || item.product.name}
                          </div>
                          <div className="text-blue-400 text-xs">
                            {formatPrice(item.unitPrice)}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          حذف
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateCartQuantity(item.product.id, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center text-sm"
                        />
                        <button
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
                        >
                          +
                        </button>
                        <div className="flex-1 text-left text-white text-sm font-medium">
                          {formatPrice(item.total)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t border-gray-700 pt-4 space-y-2">
                  <div className="flex justify-between text-gray-300">
                    <span>المجموع الفرعي:</span>
                    <span>{formatPrice(calculateSubtotal())}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <label className="text-gray-300">الخصم (جنيه):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount / 100}
                      onChange={(e) => setDiscount(Math.round(parseFloat(e.target.value) * 100) || 0)}
                      className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-left text-sm"
                    />
                  </div>

                  <div className="flex justify-between text-white text-lg font-bold pt-2 border-t border-gray-700">
                    <span>الإجمالي:</span>
                    <span>{formatPrice(calculateTotal())}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    طريقة الدفع
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CASH">نقدي</option>
                    <option value="CARD">بطاقة</option>
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    ملاحظات
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleCheckout}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium text-white ${
                      !isOnline
                        ? 'bg-yellow-600 hover:bg-yellow-700'
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {!isOnline ? 'حفظ محلياً' : 'إتمام البيع'}
                  </button>
                  <button
                    onClick={clearCart}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sales List Tab */}
      {activeTab === 'sales' && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          {!isOnline ? (
            <div className="p-8 text-center text-gray-400">
              غير متصل بالإنترنت — سجل المبيعات غير متاح بدون اتصال
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
          ) : sales.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              لا توجد مبيعات.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                      رقم الفاتورة
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                      التاريخ
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                      المنتجات
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                      الإجمالي
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                      طريقة الدفع
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-white font-medium">
                        {sale.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {formatDate(sale.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {sale.items.length} منتج
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {formatPrice(sale.finalTotalPiasters)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs font-medium bg-blue-900/30 text-blue-400 rounded">
                          {getPaymentMethodLabel(sale.paymentMethod)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
