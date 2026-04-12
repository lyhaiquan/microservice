import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, register, isLoading, error, isAuthenticated, clearError } = useAuthStore();

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    clearError();
  }, [isLoginMode]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let result;
    if (isLoginMode) {
      result = await login(formData.email, formData.password);
    } else {
      result = await register(formData.name, formData.email, formData.password);
    }
    if (result.success) {
      navigate('/', { replace: true });
    }
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setFormData({ name: '', email: '', password: '' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header Bar */}
      <header className="gradient-shopee py-3 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-white text-2xl font-bold tracking-wide">Shopee</span>
          </div>
          <span className="text-white/90 text-lg font-medium hidden sm:block">
            {isLoginMode ? 'Đăng Nhập' : 'Đăng Ký'}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8"
            style={{ background: 'linear-gradient(135deg, #ee4d2d 0%, #ff7043 40%, #f5f5f5 40%)' }}>
        <div className="w-full max-w-5xl flex items-center gap-12">

          {/* Left Side — Branding (hidden on mobile) */}
          <div className="hidden lg:flex flex-col items-start flex-1 animate-fade-in">
            <h1 className="text-white text-5xl font-extrabold leading-tight mb-4 drop-shadow-lg">
              Shopee
            </h1>
            <p className="text-white/90 text-xl font-medium leading-relaxed max-w-sm">
              Nền tảng thương mại điện tử yêu thích nhất Đông Nam Á & Đài Loan
            </p>
            <div className="mt-8 flex gap-4">
              {['🛒', '📦', '🚚'].map((emoji, i) => (
                <div key={i}
                     className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg animate-slide-up"
                     style={{ animationDelay: `${i * 0.15}s`, animationFillMode: 'backwards' }}>
                  {emoji}
                </div>
              ))}
            </div>
          </div>

          {/* Right Side — Login Form */}
          <div className="w-full max-w-md animate-slide-up">
            <div className="bg-white rounded-lg shadow-2xl p-8"
                 style={{ boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15)' }}>

              {/* Form Title */}
              <h2 className="text-xl font-semibold text-shopee-text mb-6 text-center">
                {isLoginMode ? 'Đăng Nhập' : 'Đăng Ký'}
              </h2>

              {/* Error Alert */}
              {error && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2 animate-fade-in">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Name (Register only) */}
                {!isLoginMode && (
                  <div className="animate-fade-in">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <input
                        id="register-name"
                        type="text"
                        name="name"
                        placeholder="Họ và tên"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="input-shopee pl-10"
                      />
                    </div>
                  </div>
                )}

                {/* Email */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="input-shopee pl-10"
                    autoComplete="email"
                  />
                </div>

                {/* Password */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Mật khẩu"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="input-shopee pl-10 pr-12"
                    autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    id="toggle-password"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  id="submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="btn-shopee w-full py-3 text-sm tracking-wider flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Đang xử lý...</span>
                    </>
                  ) : (
                    <span>{isLoginMode ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ'}</span>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-xs text-gray-400 uppercase tracking-wider">hoặc</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>

              {/* Social Login Buttons */}
              <div className="flex gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer"
                        id="social-facebook">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span>Facebook</span>
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer"
                        id="social-google">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google</span>
                </button>
              </div>

              {/* Toggle Login / Register */}
              <div className="mt-6 text-center text-sm text-gray-500">
                {isLoginMode ? (
                  <p>
                    Bạn mới biết đến Shopee?{' '}
                    <button
                      onClick={toggleMode}
                      className="text-shopee font-semibold hover:underline cursor-pointer"
                      id="toggle-register"
                    >
                      Đăng Ký
                    </button>
                  </p>
                ) : (
                  <p>
                    Bạn đã có tài khoản?{' '}
                    <button
                      onClick={toggleMode}
                      className="text-shopee font-semibold hover:underline cursor-pointer"
                      id="toggle-login"
                    >
                      Đăng Nhập
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        <p>© 2026 Shopee Clone — PTIT Microservices Project</p>
      </footer>
    </div>
  );
};

export default LoginPage;
