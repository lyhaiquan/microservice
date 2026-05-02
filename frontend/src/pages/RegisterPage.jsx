import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', region: 'SOUTH' });

  useEffect(() => { if (isAuthenticated) navigate('/', { replace: true }); }, [isAuthenticated]);
  useEffect(() => { clearError(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(form);
    if (result.success) navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="gradient-shopee py-3 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-white text-2xl font-bold">Shopee</span>
          </Link>
          <span className="text-white/90 text-lg font-medium">Đăng Ký</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 bg-shopee-bg">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <h2 className="text-xl font-semibold text-center mb-6">Đăng Ký</h2>

            {error && (
              <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="fullName" placeholder="Họ và tên" required
                value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="input-shopee"
              />
              <input
                name="email" type="email" placeholder="Email" required
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-shopee"
              />
              <input
                name="password" type="password" placeholder="Mật khẩu (tối thiểu 6 ký tự)" required minLength={6}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-shopee"
              />
              <select
                value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="input-shopee"
              >
                <option value="NORTH">Miền Bắc</option>
                <option value="CENTRAL">Miền Trung</option>
                <option value="SOUTH">Miền Nam</option>
              </select>

              <button type="submit" disabled={isLoading} className="btn-shopee w-full py-3 text-sm">
                {isLoading ? 'Đang xử lý...' : 'ĐĂNG KÝ'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-500">
              Bạn đã có tài khoản?{' '}
              <Link to="/login" className="text-shopee font-semibold hover:underline">Đăng Nhập</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterPage;
