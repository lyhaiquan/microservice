import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { formatVND } from '../../utils/format';

const SellerProductsPage = () => {
  const { user } = useAuthStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const load = async () => {
    setLoading(true);
    try {
      const params = { sellerId: user.id };
      if (filter !== 'ALL') params.status = filter;
      const res = await api.get('/products', { params });
      setProducts(res.data.data || []);
    } catch { setProducts([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleDelete = async (id) => {
    if (!confirm('Xóa sản phẩm này?')) return;
    try {
      await api.delete(`/products/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Sản phẩm của tôi</h2>
        <Link to="/seller/products/new" className="btn-shopee px-4 py-2 text-sm">
          + Thêm sản phẩm
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-4 border-b flex gap-2">
          {[
            { v: 'ALL', label: 'Tất cả' },
            { v: 'ACTIVE', label: 'Đang bán' },
            { v: 'INACTIVE', label: 'Tạm ngưng' },
            { v: 'BANNED', label: 'Bị cấm' },
          ].map((tab) => (
            <button
              key={tab.v}
              onClick={() => setFilter(tab.v)}
              className={`px-3 py-1.5 rounded text-sm cursor-pointer ${
                filter === tab.v ? 'bg-shopee text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang tải...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p>Chưa có sản phẩm nào</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">Sản phẩm</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Giá</th>
                <th className="px-4 py-3 text-right">Tồn kho</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const v = p.variants?.[0] || {};
                return (
                  <tr key={p._id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium line-clamp-1">{p.name}</p>
                      <p className="text-xs text-gray-400">{p._id}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{v.skuId || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-shopee">{formatVND(v.price || 0)}</td>
                    <td className="px-4 py-3 text-right">{v.availableStock || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                        p.status === 'BANNED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/seller/products/${p._id}/edit`} className="text-blue-600 hover:underline mr-3">Sửa</Link>
                      <button onClick={() => handleDelete(p._id)} className="text-red-600 hover:underline cursor-pointer">Xóa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SellerProductsPage;
