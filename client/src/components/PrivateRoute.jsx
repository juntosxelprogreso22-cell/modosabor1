import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PrivateRoute({ permission }) {
  const { isAuth, loading, hasPermission } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    </div>
  );
  if (isAuth && permission && !hasPermission(permission)) return <Navigate to="/admin/dashboard" replace />;
  return isAuth ? <Outlet /> : <Navigate to="/admin" replace />;
}
