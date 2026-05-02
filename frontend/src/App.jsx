import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ProductListPage from './pages/ProductListPage';
import ProductDetailPage from './pages/ProductDetailPage';
import SearchPage from './pages/SearchPage';

import CartPage from './pages/buyer/CartPage';
import CheckoutPage from './pages/buyer/CheckoutPage';
import OrderDetailPage from './pages/buyer/OrderDetailPage';
import PaymentResultPage from './pages/buyer/PaymentResultPage';
import ProfilePage from './pages/buyer/ProfilePage';

import SellerDashboard from './pages/seller/SellerDashboard';
import SellerProductsPage from './pages/seller/SellerProductsPage';
import ProductFormPage from './pages/seller/ProductFormPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import PendingSellersPage from './pages/admin/PendingSellersPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import RefundPage from './pages/admin/RefundPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth pages (no layout) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Main app with layout */}
        <Route element={<Layout />}>
          {/* Public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductListPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/search" element={<SearchPage />} />

          {/* Buyer (login required) */}
          <Route path="/cart" element={<ProtectedRoute><CartPage /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
          <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/payment/result" element={<PaymentResultPage />} />

          {/* Seller */}
          <Route path="/seller" element={<ProtectedRoute roles={['SELLER', 'ADMIN']}><SellerDashboard /></ProtectedRoute>} />
          <Route path="/seller/products" element={<ProtectedRoute roles={['SELLER', 'ADMIN']}><SellerProductsPage /></ProtectedRoute>} />
          <Route path="/seller/products/new" element={<ProtectedRoute roles={['SELLER', 'ADMIN']}><ProductFormPage /></ProtectedRoute>} />
          <Route path="/seller/products/:id/edit" element={<ProtectedRoute roles={['SELLER', 'ADMIN']}><ProductFormPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/pending-sellers" element={<ProtectedRoute roles={['ADMIN']}><PendingSellersPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><UserManagementPage /></ProtectedRoute>} />
          <Route path="/admin/refunds" element={<ProtectedRoute roles={['ADMIN']}><RefundPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
