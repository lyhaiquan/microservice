import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import useCartStore from '../../store/useCartStore';
import useAuthStore from '../../store/useAuthStore';
import { formatVND } from '../../utils/format';

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { getSelectedItems, getTotal, clearCart } = useCartStore();
  const selectedItems = getSelectedItems();
  const total = getTotal();

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleOrder = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/orders', {
        userId: user.id,
        items: selectedItems.map((i) => ({ skuId: i.skuId, quantity: i.quantity })),
        totalAmount: total,
        idempotencyKey,
      }, {
        headers: { 'x-idempotency-key': idempotencyKey }
      });
      const order = res.data.data;
      clearCart();
      navigate(`/orders/${order._id}`, { state: { justCreated: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Đặt hàng thất bại');
      setSubmitting(false);
    }
  };

  if (selectedItems.length === 0) {
    navigate('/cart');
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Thanh toán</h2>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded">{error}</div>}

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h3 className="text-sm font-medium text-gray-600 mb-3">Sản phẩm</h3>
        <div className="space-y-3">
          {selectedItems.map((item) => (
            <div key={item.skuId} className="flex items-center gap-3 text-sm">
              <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-lg opacity-30">📦</div>
              <div className="flex-1">
                <p className="line-clamp-1">{item.productNameSnapshot}</p>
                <p className="text-gray-400 text-xs">x{item.quantity}</p>
              </div>
              <p className="text-shopee font-medium">{formatVND((item.priceSnapshot || 0) * item.quantity)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h3 className="text-sm font-medium text-gray-600 mb-3">Thông tin</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p>Người nhận: <span className="font-medium">{user?.fullName}</span></p>
          <p>Khu vực: <span className="font-medium">{user?.region}</span></p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Tổng tiền hàng</span>
          <span>{formatVND(total)}</span>
        </div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Phí vận chuyển</span>
          <span className="text-green-600">Miễn phí</span>
        </div>
        <div className="border-t pt-3 flex justify-between font-bold text-lg">
          <span>Tổng thanh toán</span>
          <span className="text-shopee">{formatVND(total)}</span>
        </div>

        <p className="text-[10px] text-gray-400 mt-2 break-all">Idempotency: {idempotencyKey}</p>

        <button
          onClick={handleOrder}
          disabled={submitting}
          className="btn-shopee w-full py-3 mt-4 text-sm disabled:opacity-50"
        >
          {submitting ? 'Đang xử lý...' : 'Đặt hàng'}
        </button>
      </div>
    </div>
  );
};

export default CheckoutPage;
