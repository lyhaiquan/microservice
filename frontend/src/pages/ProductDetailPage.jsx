import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import useCartStore from '../store/useCartStore';
import useAuthStore from '../store/useAuthStore';
import { formatVND, REGION_LABELS } from '../utils/format';

const ProductDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const addToCart = useCartStore((s) => s.addToCart);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/products/${id}`);
        setProduct(res.data.data);
      } catch {
        setProduct(null);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleAdd = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    setAdding(true);
    const result = await addToCart(product._id, qty);
    setAdding(false);
    if (result.success) {
      setToast('Đã thêm vào giỏ hàng!');
      setTimeout(() => setToast(''), 2000);
    } else {
      setToast(result.message || 'Lỗi');
      setTimeout(() => setToast(''), 3000);
    }
  };

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg p-8 animate-pulse">
        <div className="flex gap-8">
          <div className="w-96 h-96 bg-gray-200 rounded" />
          <div className="flex-1 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-4xl mb-2">😕</p>
      <p>Sản phẩm không tồn tại</p>
    </div>
  );

  const variant = product.variants?.[selectedVariant];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded shadow-lg animate-fade-in text-sm">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-96 aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center text-8xl opacity-30 shrink-0">
            📦
          </div>

          <div className="flex-1">
            <h1 className="text-xl font-medium text-gray-800 mb-2">{product.name}</h1>

            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
              {product.rating > 0 && <span className="text-yellow-500">★ {product.rating.toFixed(1)}</span>}
              <span>{product.numReviews} đánh giá</span>
              <span>Khu vực: {REGION_LABELS[product.sellerRegion] || product.sellerRegion}</span>
            </div>

            <div className="bg-shopee-bg p-4 rounded mb-4">
              <span className="text-shopee text-3xl font-bold">{formatVND(variant?.price || 0)}</span>
            </div>

            {product.variants?.length > 1 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Phân loại:</p>
                <div className="flex gap-2 flex-wrap">
                  {product.variants.map((v, i) => (
                    <button
                      key={v.skuId}
                      onClick={() => { setSelectedVariant(i); setQty(1); }}
                      className={`px-3 py-1.5 border rounded text-sm cursor-pointer ${
                        i === selectedVariant ? 'border-shopee text-shopee bg-shopee/5' : 'border-gray-300'
                      }`}
                    >
                      {v.skuId}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Số lượng:</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 border rounded flex items-center justify-center cursor-pointer hover:bg-gray-50">-</button>
                <input
                  type="number" value={qty} min={1} max={variant?.availableStock || 99}
                  onChange={(e) => setQty(Math.max(1, Math.min(variant?.availableStock || 99, +e.target.value || 1)))}
                  className="w-16 h-8 border rounded text-center text-sm outline-none"
                />
                <button onClick={() => setQty(Math.min(variant?.availableStock || 99, qty + 1))} className="w-8 h-8 border rounded flex items-center justify-center cursor-pointer hover:bg-gray-50">+</button>
                <span className="text-sm text-gray-400 ml-2">{variant?.availableStock || 0} sản phẩm có sẵn</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAdd}
                disabled={adding || !variant?.availableStock}
                className="flex-1 py-3 border-2 border-shopee text-shopee rounded hover:bg-shopee/5 font-medium text-sm cursor-pointer disabled:opacity-50"
              >
                {adding ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
              </button>
              <button
                onClick={() => { handleAdd().then(() => navigate('/cart')); }}
                disabled={adding || !variant?.availableStock}
                className="flex-1 btn-shopee py-3 text-sm disabled:opacity-50"
              >
                Mua ngay
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
