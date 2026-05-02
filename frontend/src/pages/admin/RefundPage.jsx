import { useState } from 'react';
import api from '../../api/axios';
import { formatVND } from '../../utils/format';

const RefundPage = () => {
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post(`/payments/refund/${paymentId}`, {
        amount: Number(amount),
        reason,
      });
      setResult(res.data);
      setPaymentId('');
      setAmount('');
      setReason('');
    } catch (err) {
      setError(err.response?.data?.message || 'Hoàn tiền thất bại');
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Hoàn tiền (Refund)</h2>

      {result && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="font-medium text-green-800">✅ Hoàn tiền thành công</p>
          <p className="text-sm text-green-700 mt-1">
            Payment {result.data?.paymentId} — Đã hoàn: {formatVND(result.data?.refundedAmount || 0)}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment ID</label>
          <input
            type="text" value={paymentId} required
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder="VD: PAY_100001"
            className="input-shopee"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền hoàn (VND)</label>
          <input
            type="number" value={amount} required min={1}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="VD: 500000"
            className="input-shopee"
          />
          {amount && (
            <p className="text-xs text-gray-500 mt-1">{formatVND(Number(amount))}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lý do hoàn tiền</label>
          <textarea
            value={reason} required rows={3}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Khách hàng yêu cầu hủy đơn..."
            className="input-shopee resize-none"
          />
        </div>

        <button
          type="submit" disabled={submitting}
          className="btn-shopee w-full py-3 text-sm disabled:opacity-50"
        >
          {submitting ? 'Đang xử lý...' : 'Xác nhận hoàn tiền'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Rate limit: 10 lần / giờ. Hành động này không thể hoàn tác.
        </p>
      </form>
    </div>
  );
};

export default RefundPage;
