import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import ProductCard from '../components/product/ProductCard';

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) { setResults([]); setLoading(false); return; }
    const search = async () => {
      setLoading(true);
      try {
        const res = await api.get('/products/search', { params: { q } });
        setResults(res.data.data || []);
      } catch { setResults([]); }
      setLoading(false);
    };
    search();
  }, [q]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Kết quả tìm kiếm cho &ldquo;{q}&rdquo;
      </h2>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg overflow-hidden animate-pulse">
              <div className="aspect-square bg-gray-200" />
              <div className="p-3 space-y-2"><div className="h-3 bg-gray-200 rounded w-3/4" /></div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-2">🔍</p>
          <p>Không tìm thấy sản phẩm nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {results.map((p) => <ProductCard key={p._id} product={p} />)}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
