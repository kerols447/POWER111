import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NetworkStatus } from './components/NetworkStatus';
import { startAutoSync } from './utils/syncEngine';
import { startOfflinePrefetch } from './utils/offlinePrefetch';
import { useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import PortalPage from './pages/PortalPage';
import AdminLayout from './components/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import MemberDetailPage from './pages/MemberDetailPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import AttendancePage from './pages/AttendancePage';
import StaffPage from './pages/StaffPage';
import ProductsPage from './pages/ProductsPage';
import SalesPage from './pages/SalesPage';
import ExpensesPage from './pages/ExpensesPage';
import ReportsPage from './pages/ReportsPage';
import WhatsAppPage from './pages/WhatsAppPage';
import SettingsPage from './pages/SettingsPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import OffersPage from './pages/OffersPage';

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
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
