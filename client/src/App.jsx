import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TPV from './pages/TPV.jsx';
import Pedidos from './pages/Pedidos.jsx';
import Productos from './pages/Productos.jsx';
import Categorias from './pages/Categorias.jsx';
import Clientes from './pages/Clientes.jsx';
import Delivery from './pages/Delivery.jsx';
import KDS from './pages/KDS.jsx';
import Mesas from './pages/Mesas.jsx';
import Caja from './pages/Caja.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Reportes from './pages/Reportes.jsx';
import Configuracion from './pages/Configuracion.jsx';
import WhatsAppInbox from './pages/WhatsAppInbox.jsx';
import Cuenta from './pages/Cuenta.jsx';
import Personal from './pages/Personal.jsx';
import WebPublica from './pages/WebPublica.jsx';
import SeguimientoPedido from './pages/SeguimientoPedido.jsx';
import RiderPanel from './pages/RiderPanel.jsx';
import api from './lib/api.js';
import { applyBranding } from './lib/branding.js';

export default function App() {
  useEffect(() => {
    api.get('/configuracion').then(applyBranding).catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/" element={<WebPublica />} />
          <Route path="/seguimiento/:id" element={<SeguimientoPedido />} />
          <Route path="/rider/:id/:codigo" element={<RiderPanel />} />
          <Route path="/admin" element={<Login />} />
          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route element={<PrivateRoute permission="dashboard.view" />}>
                <Route path="/admin/dashboard" element={<Dashboard />} />
              </Route>
              <Route element={<PrivateRoute permission="tpv.use" />}>
                <Route path="/admin/tpv" element={<TPV />} />
              </Route>
              <Route element={<PrivateRoute permission="pedidos.view" />}>
                <Route path="/admin/pedidos" element={<Pedidos />} />
              </Route>
              <Route element={<PrivateRoute permission="caja.view" />}>
                <Route path="/admin/caja" element={<Caja />} />
              </Route>
              <Route element={<PrivateRoute permission="kds.view" />}>
                <Route path="/admin/kds" element={<KDS />} />
              </Route>
              <Route element={<PrivateRoute permission="mesas.view" />}>
                <Route path="/admin/mesas" element={<Mesas />} />
              </Route>
              <Route element={<PrivateRoute permission="delivery.view" />}>
                <Route path="/admin/delivery" element={<Delivery />} />
              </Route>
              <Route element={<PrivateRoute permission="productos.edit" />}>
                <Route path="/admin/productos" element={<Productos />} />
                <Route path="/admin/categorias" element={<Categorias />} />
              </Route>
              <Route element={<PrivateRoute permission="clientes.view" />}>
                <Route path="/admin/clientes" element={<Clientes />} />
              </Route>
              <Route path="/admin/cuenta" element={<Cuenta />} />
              <Route element={<PrivateRoute permission="reportes.view" />}>
                <Route path="/admin/reportes" element={<Reportes />} />
              </Route>
              <Route element={<PrivateRoute permission="config.manage" />}>
                <Route path="/admin/configuracion" element={<Configuracion />} />
                <Route path="/admin/personal" element={<Personal />} />
                <Route path="/admin/whatsapp" element={<WhatsAppInbox />} />
                <Route path="/admin/usuarios" element={<Usuarios />} />
              </Route>
              <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
