import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';

const SellerDashboard = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ products: 0, active: 0, outOfStock: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/products', { params: { sellerId: user.id } });
        const items = res.data.data || [];
        setStats({
          products: items.length,
          active: items.filter((p) => p.status === 'ACTIVE').length,
          outOfStock: items.filter((p) =>
            (p.variants || []).every((v) => v.availableStock === 0)
          ).length,
        });
      } catch {}
      setLoading(false);
    };
    load();
  }, [user.id]);

  const cards = [
    { label: 'Tổng sản phẩm', value: stats.products, color: 'bg-blue-500' },
    { label: 'Đang bán', value: stats.active, color: 'bg-green-500' },
    { label: 'Hết hàng', value: stats.outOfStock, color: 'bg-red-500' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Kênh người bán</h2>
        <Link to="/seller/products/new" className="btn-shopee px-4 py-2 text-sm">
          + Thêm sản phẩm
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full ${c.color} text-white flex items-center justify-center text-xl font-bold`}>
              {loading ? '...' : c.value}
            </div>
            <div>
              <p className="text-sm text-gray-500">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-base font-medium mb-4">Quản lý nhanh</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link to="/seller/products" className="border rounded p-4 hover:border-shopee hover:bg-shopee/5 transition text-sm text-center">
            📦 Quản lý sản phẩm
          </Link>
          <Link to="/seller/products/new" className="border rounded p-4 hover:border-shopee hover:bg-shopee/5 transition text-sm text-center">
            ➕ Thêm SP mới
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SellerDashboard;
