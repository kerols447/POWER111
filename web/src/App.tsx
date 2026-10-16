import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NetworkStatus } from './components/NetworkStatus';
import { startAutoSync } from './utils/syncEngine';
import { startOfflinePrefetch } from './utils/offlinePrefetch';
import { useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/AdminLayout';

// Every screen below is a separate chunk: the public site and the member portal
// never download the admin, and the admin never downloads the scanner or the charts
// until the page that needs them opens.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const PortalPage = lazy(() => import('./pages/PortalPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const StaffPage = lazy(() => import('./pages/StaffPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BranchesPage = lazy(() => import('./pages/BranchesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const OffersPage = lazy(() => import('./pages/OffersPage'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3 text-gray-500 text-sm">
      <span className="w-5 h-5 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
      <span>جاري التحميل...</span>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function SyncManager() {
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready || !user) return;
    const stopSync = startAutoSync(30000);
    const stopPrefetch = startOfflinePrefetch();
    return () => {
      stopSync();
      stopPrefetch();
    };
  }, [ready, user]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SyncManager />
        <NetworkStatus />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="branches" element={<BranchesPage />} />
              <Route path="offers" element={<OffersPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="members/:id" element={<MemberDetailPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="whatsapp" element={<WhatsAppPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
