import { useState } from 'react';
import api from '../../api/axios';

const UserManagementPage = () => {
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleBan = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!confirm(`Ban user ${userId}? Tất cả session sẽ bị thu hồi.`)) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post(`/auth/admin/users/${userId}/ban`);
      setResult(res.data);
      setUserId('');
    } catch (err) {
      setError(err.response?.data?.message || 'Ban thất bại');
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Quản lý người dùng</h2>

      {result && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="font-medium text-green-800">✅ {result.message}</p>
          <p className="text-sm text-green-700 mt-1">User: {result.data?.id} — Status: {result.data?.status}</p>
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded">{error}</div>}

      <form onSubmit={handleBan} className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">User ID cần ban</label>
          <input
            type="text" value={userId} required
            onChange={(e) => setUserId(e.target.value)}
            placeholder="VD: USR_100001"
            className="input-shopee"
          />
        </div>
        <button
          type="submit" disabled={submitting}
          className="w-full py-3 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? 'Đang xử lý...' : 'BAN USER'}
        </button>
        <p className="text-xs text-gray-400 text-center">
          User bị ban sẽ không đăng nhập được. Tất cả session đang mở sẽ bị thu hồi.
        </p>
      </form>
    </div>
  );
};

export default UserManagementPage;
