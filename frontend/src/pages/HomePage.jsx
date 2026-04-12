import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

const HomePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-shopee-bg">
      {/* Header */}
      <header className="gradient-shopee shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between py-2 text-xs text-white/80 border-b border-white/10">
            <div className="flex gap-4">
              <span>Kênh Người Bán</span>
              <span>Tải ứng dụng</span>
              <span>Kết nối</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Thông báo</span>
              <span>Hỗ trợ</span>
            </div>
          </div>

          {/* Main header */}
          <div className="flex items-center gap-6 py-3">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span className="text-white text-2xl font-bold">Shopee</span>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm kiếm sản phẩm..."
                  className="w-full py-2.5 px-4 pr-12 rounded-sm text-sm outline-none text-gray-800"
                  id="search-input"
                />
                <button className="absolute right-0 top-0 h-full px-5 bg-shopee-dark hover:bg-shopee rounded-r-sm flex items-center justify-center transition-colors cursor-pointer"
                        id="search-btn">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Cart Icon */}
            <button className="relative p-2 text-white hover:opacity-80 transition cursor-pointer" id="cart-btn">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              <span className="absolute -top-1 -right-1 bg-white text-shopee text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                0
              </span>
            </button>

            {/* User Menu */}
            <div className="flex items-center gap-2 text-white text-sm">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-semibold text-xs">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="hidden sm:inline font-medium max-w-[100px] truncate">{user?.name || 'User'}</span>
              <button
                onClick={handleLogout}
                className="ml-2 text-white/70 hover:text-white text-xs underline transition cursor-pointer"
                id="logout-btn"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="gradient-shopee rounded-xl p-8 text-white relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-6 right-10 w-32 h-32 rounded-full bg-white/30 blur-3xl"></div>
            <div className="absolute bottom-4 left-20 w-48 h-48 rounded-full bg-white/20 blur-3xl"></div>
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-extrabold mb-2">🎉 Chào mừng {user?.name || 'bạn'}!</h2>
            <p className="text-white/80 text-lg mb-4">Khám phá hàng ngàn sản phẩm với giá ưu đãi</p>
            <div className="flex gap-3">
              <span className="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium">🔥 Flash Sale</span>
              <span className="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium">🎁 Voucher</span>
              <span className="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium">🚚 Freeship</span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Danh Mục</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-4">
            {[
              { emoji: '👕', label: 'Thời Trang' },
              { emoji: '📱', label: 'Điện Thoại' },
              { emoji: '💻', label: 'Laptop' },
              { emoji: '🎧', label: 'Phụ Kiện' },
              { emoji: '🏠', label: 'Nhà Cửa' },
              { emoji: '🎮', label: 'Game' },
              { emoji: '📚', label: 'Sách' },
              { emoji: '🛍️', label: 'Deal Sốc' },
              { emoji: '⌚', label: 'Đồng Hồ' },
              { emoji: '🧸', label: 'Đồ Chơi' },
            ].map((cat, i) => (
              <div key={i}
                   className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-shopee-bg hover:shadow-sm transition-all cursor-pointer group animate-slide-up"
                   style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'backwards' }}>
                <span className="text-2xl group-hover:scale-110 transition-transform">{cat.emoji}</span>
                <span className="text-[11px] text-gray-600 text-center leading-tight">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Placeholder */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 mb-10">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-shopee">GỢI Ý HÔM NAY</h3>
            <div className="h-0.5 flex-1 ml-4 gradient-shopee rounded opacity-30"></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i}
                   className="bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-lg hover:border-shopee/20 transition-all cursor-pointer group animate-slide-up"
                   style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'backwards' }}>
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-30">📦</div>
                  <div className="absolute top-2 left-2 bg-shopee text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">
                    -{(10 + i * 5)}%
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-700 line-clamp-2 mb-2 leading-relaxed min-h-[32px]">Sản phẩm mẫu #{i + 1} — Đang tải...</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-shopee font-bold text-base">₫{(99000 + i * 50000).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-400">Đã bán {100 + i * 23}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        <p>© 2026 Shopee Clone — PTIT Microservices Project</p>
      </footer>
    </div>
  );
};

export default HomePage;
