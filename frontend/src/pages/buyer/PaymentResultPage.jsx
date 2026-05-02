import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const PaymentResultPage = () => {
  const [params] = useSearchParams();
  const code = params.get('vnp_ResponseCode');
  const orderId = params.get('vnp_TxnRef')?.split('_').slice(0, 2).join('_');
  const isSuccess = code === '00';

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="bg-white rounded-lg shadow-sm p-8">
        <p className="text-6xl mb-4">{isSuccess ? '✅' : '❌'}</p>
        <h2 className="text-xl font-bold mb-2">
          {isSuccess ? 'Thanh toán thành công!' : 'Thanh toán thất bại'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isSuccess
            ? `Đơn hàng ${orderId || ''} đã được thanh toán thành công.`
            : `Mã lỗi: ${code}. Vui lòng thử lại.`}
        </p>
        <div className="flex gap-3 justify-center">
          {orderId && (
            <Link to={`/orders/${orderId}`} className="btn-shopee px-6 py-2 text-sm">
              Xem đơn hàng
            </Link>
          )}
          <Link to="/" className="px-6 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentResultPage;
