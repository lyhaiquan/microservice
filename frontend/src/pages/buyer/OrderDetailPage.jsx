import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import { formatVND, formatDate, ORDER_STATUS } from '../../utils/format';

const OrderDetailPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/orders/${id}`);
        setOrder(res.data.data);
      } catch { setOrder(null); }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg p-6 animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/3" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-20 bg-gray-200 rounded" />
      </div>
    </div>
  );

  if (!order) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-4xl mb-2">📋</p>
      <p>Không tìm thấy đơn hàng</p>
      <Link to="/" className="text-shopee text-sm mt-2 inline-block hover:underline">Về trang chủ</Link>
    </div>
  );

  const st = ORDER_STATUS[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-50' };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Đơn hàng {order._id}</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="text-sm text-gray-600 space-y-1">
          <p>Ngày tạo: {formatDate(order.createdAt)}</p>
          <p>Khu vực: {order.region} → Giao đến: {order.deliveryRegion}</p>
          {order.isCrossRegion && <p className="text-yellow-600">⚠️ Đơn liên vùng</p>}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h3 className="text-sm font-medium text-gray-600 mb-3">Sản phẩm</h3>
        <div className="space-y-3">
          {order.items?.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-lg opacity-30">📦</div>
              <div className="flex-1">
                <p>{item.productNameSnapshot}</p>
                <p className="text-gray-400 text-xs">SKU: {item.skuId} · x{item.quantity}</p>
              </div>
              <p className="font-medium">{formatVND(item.lineTotal)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Tạm tính</span><span>{formatVND(order.pricing?.itemsSubtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Phí ship</span><span>{formatVND(order.pricing?.shippingFee)}</span></div>
          {order.pricing?.refundedAmount > 0 && (
            <div className="flex justify-between text-green-600"><span>Hoàn tiền</span><span>-{formatVND(order.pricing.refundedAmount)}</span></div>
          )}
          <div className="border-t pt-2 flex justify-between font-bold text-lg">
            <span>Tổng</span>
            <span className="text-shopee">{formatVND(order.pricing?.grandTotal)}</span>
          </div>
        </div>
      </div>

      {order.statusHistory?.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Lịch sử trạng thái</h3>
          <div className="space-y-2">
            {order.statusHistory.map((h, i) => {
              const hs = ORDER_STATUS[h.status] || { label: h.status, color: '' };
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-shopee' : 'bg-gray-300'}`} />
                  <span className="font-medium">{hs.label}</span>
                  <span className="text-gray-400 text-xs">{formatDate(h.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetailPage;
