import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useCartStore from '../../store/useCartStore';

const Header = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const itemCount = useCartStore((s) => s.getItemCount());
  const [search, setSearch] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const isAdmin = user?.roles?.includes('ADMIN');
  const isSeller = user?.roles?.includes('SELLER');

  return (
    <header className="gradient-shopee shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between py-2 text-xs text-white/80 border-b border-white/10">
          <div className="flex gap-4">
            {isSeller && <Link to="/seller" className="hover:text-white">Kênh Người Bán</Link>}
            {isAdmin && <Link to="/admin" className="hover:text-white">Quản trị</Link>}
          </div>
          <div className="flex items-center gap-4">
            <Link to="/notifications" className="hover:text-white">Thông báo</Link>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 py-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-white text-2xl font-bold hidden sm:inline">Shopee</span>
          </Link>

          <form onSubmit={handleSearch} className="flex-1 max-w-2xl">
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm kiếm sản phẩm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full py-2.5 px-4 pr-12 rounded-sm text-sm outline-none text-gray-800"
              />
              <button type="submit" className="absolute right-0 top-0 h-full px-5 bg-shopee-dark hover:bg-shopee rounded-r-sm cursor-pointer">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          <Link to="/cart" className="relative p-2 text-white hover:opacity-80 shrink-0">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-shopee text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-2 text-white text-sm shrink-0">
              <Link to="/profile" className="flex items-center gap-2 hover:opacity-80">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-semibold text-xs">
                  {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <span className="hidden sm:inline font-medium max-w-[100px] truncate">{user?.fullName || 'User'}</span>
              </Link>
              <button onClick={handleLogout} className="ml-2 text-white/70 hover:text-white text-xs underline cursor-pointer">Thoát</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-white text-sm shrink-0">
              <Link to="/login" className="hover:underline">Đăng nhập</Link>
              <span className="opacity-50">|</span>
              <Link to="/register" className="hover:underline">Đăng ký</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
