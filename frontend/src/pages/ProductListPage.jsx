import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import ProductCard from '../components/product/ProductCard';

const ProductListPage = () => {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('newest');
  const categoryId = searchParams.get('category');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = { sort, status: 'ACTIVE' };
        if (categoryId) params.categoryId = categoryId;
        const res = await api.get('/products', { params });
        setProducts(res.data.data || []);
      } catch { setProducts([]); }
      setLoading(false);
    };
    load();
  }, [sort, categoryId]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          {categoryId ? `Danh mục` : 'Tất cả sản phẩm'}
        </h2>
        <select
          value={sort} onChange={(e) => setSort(e.target.value)}
          className="text-sm border border-gray-300 rounded px-3 py-1.5 outline-none focus:border-shopee"
        >
          <option value="newest">Mới nhất</option>
          <option value="price_asc">Giá thấp → cao</option>
          <option value="price_desc">Giá cao → thấp</option>
        </select>
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
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>Không tìm thấy sản phẩm nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductListPage;
