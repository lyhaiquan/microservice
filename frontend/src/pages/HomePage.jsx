import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import useAuthStore from '../store/useAuthStore';
import ProductCard from '../components/product/ProductCard';

const HomePage = () => {
  const { user } = useAuthStore();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [prodRes] = await Promise.all([
          api.get('/products', { params: { sort: 'newest', status: 'ACTIVE' } }),
        ]);
        setProducts(prodRes.data.data || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const categoryEmojis = [
    { emoji: '👕', label: 'Thời Trang' }, { emoji: '📱', label: 'Điện Thoại' },
    { emoji: '💻', label: 'Laptop' }, { emoji: '🎧', label: 'Phụ Kiện' },
    { emoji: '🏠', label: 'Nhà Cửa' }, { emoji: '🎮', label: 'Game' },
    { emoji: '📚', label: 'Sách' }, { emoji: '🛍️', label: 'Deal Sốc' },
    { emoji: '⌚', label: 'Đồng Hồ' }, { emoji: '🧸', label: 'Đồ Chơi' },
  ];

  return (
    <>
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="gradient-shopee rounded-xl p-8 text-white relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-6 right-10 w-32 h-32 rounded-full bg-white/30 blur-3xl" />
            <div className="absolute bottom-4 left-20 w-48 h-48 rounded-full bg-white/20 blur-3xl" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-extrabold mb-2">Chào mừng {user?.fullName || 'bạn'}!</h2>
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
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-4">
            {categoryEmojis.map((cat, i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-shopee-bg hover:shadow-sm transition-all cursor-pointer group">
                <span className="text-2xl group-hover:scale-110 transition-transform">{cat.emoji}</span>
                <span className="text-[11px] text-gray-600 text-center leading-tight">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 mb-10">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-shopee">GỢI Ý HÔM NAY</h3>
            <Link to="/products" className="text-sm text-shopee hover:underline">Xem tất cả →</Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-white rounded-lg overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {products.slice(0, 20).map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default HomePage;
