import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

const ProtectedRoute = ({ children, roles }) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && !roles.some((r) => user?.roles?.includes(r))) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
