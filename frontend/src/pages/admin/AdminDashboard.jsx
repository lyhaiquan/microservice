import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';

const AdminDashboard = () => {
  const [stats, setStats] = useState({ productCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/products/admin/stats/products/count');
        setStats({ productCount: res.data.data?.count || 0 });
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { label: 'Tổng sản phẩm', value: loading ? '...' : stats.productCount, icon: '📦', color: 'bg-blue-500' },
  ];

  const links = [
    { label: 'Duyệt Seller', desc: 'Phê duyệt seller chờ kích hoạt', icon: '👥', to: '/admin/pending-sellers' },
    { label: 'Quản lý User', desc: 'Ban / mở khóa user vi phạm', icon: '🛡️', to: '/admin/users' },
    { label: 'Hoàn tiền', desc: 'Xử lý refund cho khách', icon: '💰', to: '/admin/refunds' },
    { label: 'Tất cả sản phẩm', desc: 'Xem catalog hệ thống', icon: '🛍️', to: '/products' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Admin Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full ${c.color} text-white flex items-center justify-center text-2xl`}>
              {c.icon}
            </div>
            <div>
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className="text-2xl font-bold text-gray-800">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-base font-medium mb-4">Chức năng quản trị</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {links.map((l) => (
            <Link
              key={l.label} to={l.to}
              className="border rounded-lg p-4 flex items-start gap-3 hover:border-shopee hover:bg-shopee/5 transition"
            >
              <span className="text-2xl">{l.icon}</span>
              <div>
                <p className="font-medium text-gray-800">{l.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
