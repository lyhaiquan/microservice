import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useCartStore from '../../store/useCartStore';
import { formatVND } from '../../utils/format';

const CartPage = () => {
  const navigate = useNavigate();
  const { items, isLoading, fetchCart, updateQuantity, removeItem, toggleSelect, getTotal } = useCartStore();

  useEffect(() => { fetchCart(); }, []);

  const total = getTotal();
  const selectedCount = items.filter((i) => i.selected !== false).length;

  if (!isLoading && items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-6xl mb-4">🛒</p>
        <p className="text-gray-500 mb-4">Giỏ hàng trống</p>
        <Link to="/products" className="btn-shopee inline-block px-6 py-2 text-sm">Mua sắm ngay</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Giỏ hàng ({items.length})</h2>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 space-y-2">
          {items.map((item) => (
            <div key={item.skuId} className="bg-white rounded-lg p-4 flex items-center gap-4 shadow-sm">
              <input
                type="checkbox"
                checked={item.selected !== false}
                onChange={() => toggleSelect(item.skuId)}
                className="w-4 h-4 accent-shopee cursor-pointer"
              />
              <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center text-3xl opacity-30 shrink-0">📦</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 line-clamp-1 font-medium">{item.productNameSnapshot}</p>
                <p className="text-xs text-gray-400 mt-0.5">SKU: {item.skuId}</p>
                <p className="text-shopee font-bold mt-1">{formatVND(item.priceSnapshot || 0)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQuantity(item.skuId, item.quantity - 1)} className="w-7 h-7 border rounded text-sm cursor-pointer hover:bg-gray-50">-</button>
                <span className="w-8 text-center text-sm">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.skuId, item.quantity + 1)} className="w-7 h-7 border rounded text-sm cursor-pointer hover:bg-gray-50">+</button>
              </div>
              <p className="text-shopee font-bold w-28 text-right">{formatVND((item.priceSnapshot || 0) * item.quantity)}</p>
              <button onClick={() => removeItem(item.skuId)} className="text-gray-400 hover:text-red-500 cursor-pointer text-sm">Xóa</button>
            </div>
          ))}
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-white rounded-lg p-4 shadow-sm sticky top-20">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Tạm tính ({selectedCount} sản phẩm)</span>
              <span>{formatVND(total)}</span>
            </div>
            <div className="border-t pt-3 mt-3">
              <div className="flex justify-between font-bold text-lg">
                <span>Tổng cộng</span>
                <span className="text-shopee">{formatVND(total)}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/checkout')}
              disabled={selectedCount === 0}
              className="btn-shopee w-full py-3 mt-4 text-sm disabled:opacity-50"
            >
              Mua hàng ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
