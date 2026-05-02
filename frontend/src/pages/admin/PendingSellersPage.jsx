import { useState, useEffect } from 'react';
import api from '../../api/axios';

const PendingSellersPage = () => {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/admin/users/pending-sellers');
      setSellers(res.data.data || []);
    } catch { setSellers([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id, action) => {
    try {
      await api.post(`/auth/admin/users/${id}/${action}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Seller chờ duyệt</h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-lg p-4 animate-pulse h-16" />)}
        </div>
      ) : sellers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">✅</p>
          <p>Không có seller nào chờ duyệt</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sellers.map((s) => (
            <div key={s._id} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{s.fullName}</p>
                <p className="text-sm text-gray-400">ID: {s._id} · Region: {s.region}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(s._id, 'approve')}
                  className="px-4 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 cursor-pointer"
                >
                  Duyệt
                </button>
                <button
                  onClick={() => handleAction(s._id, 'ban')}
                  className="px-4 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 cursor-pointer"
                >
                  Từ chối
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingSellersPage;
