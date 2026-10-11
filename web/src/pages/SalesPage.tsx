import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  addPendingOperation,
  cacheProducts,
  getCachedProductsForBranch,
} from '../utils/offlineDb';

/* ─── SVG Icon Components ─── */
const IconSearch = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const IconCart = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </svg>
);

const IconPlus = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const IconMinus = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
  </svg>
);

const IconTrash = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconWifiOff = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728m12.728-12.728L5.636 18.364M12 20.25v.008M12 20.25v-.008M12 20.25a9 9 0 01-6.398-2.652M12 20.25a9 9 0 006.398-2.652M2.636 2.636L12 12m0 0l9.364 9.364M12 12L2.636 18.364M12 12l9.364-9.364" />
  </svg>
);

const IconStore = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-16.5 0a3.002 3.002 0 00-.621 4.72" />
  </svg>
);

const IconCash = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
  </svg>
);

const IconCreditCard = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const IconBank = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
  </svg>
);

const IconOther = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </svg>
);

const IconReceipt = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  </svg>
);

const IconPackage = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>
);

const IconNote = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const IconChevronDown = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const IconSparkles = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

const IconEmptyCart = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </svg>
);

/* ─── Payment Method Icon Map ─── */
const PaymentIcon = ({ method, className = "w-5 h-5" }: { method: string; className?: string }) => {
  switch (method) {
    case 'CASH': return <IconCash className={className} />;
    case 'CARD': return <IconCreditCard className={className} />;
    case 'BANK_TRANSFER': return <IconBank className={className} />;
    default: return <IconOther className={className} />;
  }
};

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

  /* ─── Payment method option metadata ─── */
  const paymentOptions = [
    { value: 'CASH', label: 'نقدي', icon: <IconCash className="w-4 h-4" /> },
    { value: 'CARD', label: 'بطاقة', icon: <IconCreditCard className="w-4 h-4" /> },
    { value: 'BANK_TRANSFER', label: 'تحويل بنكي', icon: <IconBank className="w-4 h-4" /> },
    { value: 'OTHER', label: 'أخرى', icon: <IconOther className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen space-y-4 sm:space-y-6" dir="rtl">

      {/* ══════ Offline Banner ══════ */}
      {!isOnline && (
        <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-amber-500/5 to-transparent p-3 sm:p-4">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/10 via-transparent to-transparent" />
          <div className="relative flex items-center gap-3">
            <div className="flex-shrink-0 rounded-lg bg-amber-500/20 p-2">
              <IconWifiOff className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-amber-300/90 text-xs sm:text-sm leading-relaxed">
              غير متصل بالإنترنت — يمكنك إجراء عمليات البيع وسيتم تزامنها تلقائياً عند عودة الاتصال
            </p>
          </div>
        </div>
      )}

      {/* ══════ Header ══════ */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-bl from-gray-800/80 via-gray-800/60 to-gray-900/80 p-4 sm:p-6">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-amber-500/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-32 w-32 rounded-full bg-emerald-500/[0.05] blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20">
              <IconSparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-l from-white via-white to-gray-300 bg-clip-text text-transparent">
                المبيعات
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">إدارة عمليات البيع ونقطة البيع</p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-gray-900/60 p-1 backdrop-blur-sm border border-white/[0.04]">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 rounded-lg px-4 sm:px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                activeTab === 'pos'
                  ? 'bg-gradient-to-l from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              }`}
            >
              <IconCart className="w-4 h-4" />
              <span>نقطة البيع</span>
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-2 rounded-lg px-4 sm:px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                activeTab === 'sales'
                  ? 'bg-gradient-to-l from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              }`}
            >
              <IconReceipt className="w-4 h-4" />
              <span>سجل المبيعات</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════ Branch Selector ══════ */}
      {!singleBranchUser && (
        <div className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-bl from-gray-800/70 to-gray-900/70 p-4 sm:p-5 transition-all duration-300 hover:border-white/[0.1]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-amber-500/[0.04] via-transparent to-transparent" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <IconStore className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <label className="text-sm font-semibold text-gray-300">الفرع</label>
            </div>
            <div className="relative flex-1 sm:max-w-xs">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full appearance-none rounded-lg border border-white/[0.08] bg-gray-900/60 px-4 py-2.5 pl-10 text-sm text-white shadow-sm transition-all duration-200 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <IconChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          POS TAB
         ═══════════════════════════════════════════ */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

          {/* ──── Products Panel ──── */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-bl from-gray-800/70 to-gray-900/70">
              {/* Panel header */}
              <div className="border-b border-white/[0.06] bg-gradient-to-l from-gray-800/50 to-transparent p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10">
                      <IconPackage className="w-4.5 h-4.5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-white">المنتجات</h2>
                      <p className="text-xs text-gray-500">{filteredProducts.length} منتج متاح</p>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <IconSearch className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="بحث عن منتج..."
                      className="w-full sm:w-64 rounded-lg border border-white/[0.08] bg-gray-900/60 py-2.5 pr-10 pl-4 text-sm text-white placeholder-gray-500 shadow-sm transition-all duration-200 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Products Grid */}
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 max-h-[500px] lg:max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500">
                      <IconSearch className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-sm">لا توجد منتجات مطابقة</p>
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
                          className={`group relative overflow-hidden rounded-xl border p-3 sm:p-4 text-right transition-all duration-300 ${
                            isOutOfStock
                              ? 'border-white/[0.03] bg-gray-900/40 opacity-50 cursor-not-allowed'
                              : 'border-white/[0.06] bg-gradient-to-bl from-gray-700/50 to-gray-800/50 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/[0.06] hover:-translate-y-0.5 active:translate-y-0 active:shadow-md'
                          }`}
                        >
                          {/* Decorative corner glow on hover */}
                          {!isOutOfStock && (
                            <div className="pointer-events-none absolute -top-8 -left-8 h-16 w-16 rounded-full bg-amber-500/0 group-hover:bg-amber-500/10 blur-xl transition-all duration-500" />
                          )}

                          {/* Stock badge */}
                          {isLowStock && !isOutOfStock && (
                            <span className="absolute top-2 left-2 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/20">
                              مخزون منخفض
                            </span>
                          )}
                          {isOutOfStock && (
                            <span className="absolute top-2 left-2 rounded-full bg-gray-600/30 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-600/20">
                              نفد
                            </span>
                          )}

                          <div className="relative">
                            <div className="text-white font-semibold text-xs sm:text-sm leading-snug line-clamp-2 mb-2">
                              {product.nameAr || product.name}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-400 font-bold text-sm sm:text-base">
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
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-bl from-gray-800/70 to-gray-900/70">
                {/* Cart header */}
                <div className="border-b border-white/[0.06] bg-gradient-to-l from-gray-800/50 to-transparent p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10">
                        <IconCart className="w-4.5 h-4.5 text-emerald-400" />
                      </div>
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-white">السلة</h2>
                        <p className="text-xs text-gray-500">
                          {cart.length === 0 ? 'فارغة' : `${cart.length} منتج`}
                        </p>
                      </div>
                    </div>
                    {cart.length > 0 && (
                      <button
                        onClick={clearCart}
                        className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition-all duration-200 hover:bg-rose-500/20 hover:border-rose-500/30"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                        <span>مسح</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Cart body */}
                <div className="p-4 sm:p-5">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 sm:py-16">
                      <div className="rounded-2xl bg-gray-800/50 p-5 mb-4">
                        <IconEmptyCart className="w-14 h-14 sm:w-16 sm:h-16 text-gray-600" />
                      </div>
                      <p className="text-gray-500 text-sm font-medium">السلة فارغة</p>
                      <p className="text-gray-600 text-xs mt-1">اختر منتجات من القائمة لإضافتها</p>
                    </div>
                  ) : (
                    <>
                      {/* Cart Items */}
                      <div className="space-y-2.5 max-h-[320px] lg:max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {cart.map((item, index) => (
                          <div
                            key={item.product.id}
                            className="group relative overflow-hidden rounded-xl border border-white/[0.05] bg-gradient-to-bl from-gray-700/40 to-gray-800/40 p-3 sm:p-3.5 transition-all duration-200 hover:border-white/[0.08]"
                          >
                            {/* Subtle index indicator */}
                            <div className="absolute top-0 right-0 h-full w-0.5 bg-gradient-to-b from-amber-500/40 to-amber-500/0 rounded-r" />

                            <div className="flex items-start justify-between mb-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-semibold text-xs sm:text-sm truncate">
                                  {item.product.nameAr || item.product.name}
                                </div>
                                <div className="text-amber-400/80 text-xs mt-0.5">
                                  {formatPrice(item.unitPrice)} / وحدة
                                </div>
                              </div>
                              <button
                                onClick={() => removeFromCart(item.product.id)}
                                className="flex-shrink-0 rounded-lg p-1.5 text-gray-500 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-400"
                                title="حذف"
                              >
                                <IconTrash className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-gray-800/60 text-gray-400 transition-all duration-200 hover:bg-gray-700 hover:text-white hover:border-white/[0.12]"
                              >
                                <IconMinus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateCartQuantity(item.product.id, parseInt(e.target.value) || 0)}
                                className="w-12 rounded-lg border border-white/[0.08] bg-gray-900/60 py-1.5 text-center text-sm font-semibold text-white transition-all duration-200 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-gray-800/60 text-gray-400 transition-all duration-200 hover:bg-gray-700 hover:text-white hover:border-white/[0.12]"
                              >
                                <IconPlus className="w-3.5 h-3.5" />
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
                      <div className="mt-4 rounded-xl border border-white/[0.06] bg-gray-900/30 p-3 sm:p-4 space-y-3">
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
                              className="w-24 rounded-lg border border-white/[0.08] bg-gray-800/60 py-1.5 px-3 text-left text-sm text-white transition-all duration-200 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">جنيه</span>
                          </div>
                        </div>

                        {discount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-emerald-400/80">خصم</span>
                            <span className="text-emerald-400 font-medium">- {formatPrice(discount)}</span>
                          </div>
                        )}

                        <div className="border-t border-white/[0.06] pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-base sm:text-lg">الإجمالي</span>
                            <span className="bg-gradient-to-l from-amber-400 to-amber-500 bg-clip-text text-transparent font-bold text-xl sm:text-2xl">
                              {formatPrice(calculateTotal())}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* ── Payment Method ── */}
                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <IconCreditCard className="w-4 h-4 text-gray-500" />
                          <label className="text-sm font-semibold text-gray-300">طريقة الدفع</label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {paymentOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setPaymentMethod(opt.value)}
                              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 ${
                                paymentMethod === opt.value
                                  ? 'border-amber-500/40 bg-gradient-to-l from-amber-500/15 to-amber-600/10 text-amber-300 shadow-sm shadow-amber-500/10'
                                  : 'border-white/[0.06] bg-gray-800/40 text-gray-400 hover:border-white/[0.1] hover:text-gray-300'
                              }`}
                            >
                              {opt.icon}
                              <span>{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ── Notes ── */}
                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <IconNote className="w-4 h-4 text-gray-500" />
                          <label className="text-sm font-semibold text-gray-300">ملاحظات</label>
                        </div>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={2}
                          placeholder="أضف ملاحظات للطلب..."
                          className="w-full rounded-xl border border-white/[0.08] bg-gray-900/40 px-4 py-3 text-sm text-white placeholder-gray-600 transition-all duration-200 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
                        />
                      </div>

                      {/* ── Action Buttons ── */}
                      <div className="flex gap-2.5 mt-4">
                        <button
                          onClick={handleCheckout}
                          className={`group relative flex-1 overflow-hidden rounded-xl px-4 py-3 sm:py-3.5 font-bold text-sm sm:text-base text-white shadow-lg transition-all duration-300 hover:shadow-xl active:scale-[0.98] ${
                            !isOnline
                              ? 'bg-gradient-to-l from-amber-500 to-amber-600 shadow-amber-500/20 hover:shadow-amber-500/30'
                              : 'bg-gradient-to-l from-emerald-500 to-emerald-600 shadow-emerald-500/20 hover:shadow-emerald-500/30'
                          }`}
                        >
                          {/* Shine effect */}
                          <div className="absolute inset-0 bg-gradient-to-l from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                          <span className="relative flex items-center justify-center gap-2">
                            {!isOnline ? (
                              <>
                                <IconWifiOff className="w-5 h-5" />
                                حفظ محلياً
                              </>
                            ) : (
                              <>
                                <IconCheck className="w-5 h-5" />
                                إتمام البيع
                              </>
                            )}
                          </span>
                        </button>
                        <button
                          onClick={clearCart}
                          className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-gray-800/50 px-4 py-3 sm:py-3.5 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-gray-700/50 hover:text-white hover:border-white/[0.12]"
                        >
                          <IconX className="w-5 h-5" />
                        </button>
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
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-bl from-gray-800/70 to-gray-900/70">
          {/* Decorative corner */}
          <div className="pointer-events-none absolute -top-16 -left-16 h-32 w-32 rounded-full bg-amber-500/[0.04] blur-3xl" />

          {!isOnline ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="rounded-2xl bg-gray-800/50 p-5 mb-4">
                <IconWifiOff className="w-12 h-12 text-gray-600" />
              </div>
              <p className="text-gray-400 text-sm font-medium">غير متصل بالإنترنت</p>
              <p className="text-gray-600 text-xs mt-1">سجل المبيعات غير متاح بدون اتصال</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-10 w-10 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin mb-4" />
              <p className="text-gray-400 text-sm">جاري التحميل...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="rounded-2xl bg-gray-800/50 p-5 mb-4">
                <IconReceipt className="w-12 h-12 text-gray-600" />
              </div>
              <p className="text-gray-400 text-sm font-medium">لا توجد مبيعات</p>
              <p className="text-gray-600 text-xs mt-1">ستظهر المبيعات هنا بعد إجراء أول عملية بيع</p>
            </div>
          ) : (
            <>
              {/* Mobile: Card view */}
              <div className="block lg:hidden p-4 space-y-3">
                {sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-bl from-gray-700/30 to-gray-800/30 p-4 transition-all duration-200 hover:border-white/[0.1]"
                  >
                    <div className="absolute top-0 right-0 h-full w-0.5 bg-gradient-to-b from-amber-500/40 to-amber-500/0 rounded-r" />
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-bold text-sm">{sale.invoiceNumber}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{formatDate(sale.createdAt)}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
                        <PaymentIcon method={sale.paymentMethod} className="w-3 h-3" />
                        {getPaymentMethodLabel(sale.paymentMethod)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                        <IconPackage className="w-3.5 h-3.5" />
                        <span>{sale.items.length} منتج</span>
                      </div>
                      <p className="text-amber-400 font-bold text-base">
                        {formatPrice(sale.finalTotalPiasters)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-gradient-to-l from-gray-800/50 to-transparent">
                      <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                        رقم الفاتورة
                      </th>
                      <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                        التاريخ
                      </th>
                      <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                        المنتجات
                      </th>
                      <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                        الإجمالي
                      </th>
                      <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                        طريقة الدفع
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {sales.map((sale) => (
                      <tr
                        key={sale.id}
                        className="group transition-colors duration-200 hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-4">
                          <span className="text-white font-semibold text-sm">{sale.invoiceNumber}</span>
                        </td>
                        <td className="px-5 py-4 text-gray-400 text-sm">
                          {formatDate(sale.createdAt)}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-700/50 px-2.5 py-1 text-xs font-medium text-gray-300">
                            <IconPackage className="w-3 h-3" />
                            {sale.items.length} منتج
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-amber-400 font-bold text-sm">
                            {formatPrice(sale.finalTotalPiasters)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-400 transition-all duration-200 hover:bg-amber-500/15">
                            <PaymentIcon method={sale.paymentMethod} className="w-3.5 h-3.5" />
                            {getPaymentMethodLabel(sale.paymentMethod)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Custom scrollbar styles ── */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </div>
  );
}
