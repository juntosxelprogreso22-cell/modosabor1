import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import {
  LayoutDashboard,
  ShoppingCart,
  WalletCards,
  ClipboardList,
  Armchair,
  Package,
  Tag,
  Users,
  Bike,
  BarChart2,
  Settings,
  LogOut,
  UtensilsCrossed,
  ExternalLink,
  ChefHat,
  ShieldCheck,
  MessageSquareMore,
  UserCircle2,
  UserSquare2,
} from 'lucide-react';

const links = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view' },
  { to: '/admin/tpv', icon: ShoppingCart, label: 'TPV / Caja', permission: 'tpv.use' },
  { to: '/admin/caja', icon: WalletCards, label: 'Cierre de Caja', permission: 'caja.view' },
  { to: '/admin/pedidos', icon: ClipboardList, label: 'Pedidos', permission: 'pedidos.view' },
  { to: '/admin/kds', icon: ChefHat, label: 'Cocina / KDS', permission: 'kds.view' },
  { to: '/admin/mesas', icon: Armchair, label: 'Mesas / Salon', permission: 'mesas.view' },
  { to: '/admin/delivery', icon: Bike, label: 'Delivery', permission: 'delivery.view' },
  { to: '/admin/productos', icon: Package, label: 'Productos', permission: 'productos.edit' },
  { to: '/admin/categorias', icon: Tag, label: 'Categorias', permission: 'productos.edit' },
  { to: '/admin/clientes', icon: Users, label: 'Clientes', permission: 'clientes.view' },
  { to: '/admin/reportes', icon: BarChart2, label: 'Reportes', permission: 'reportes.view' },
  { to: '/admin/cuenta', icon: UserCircle2, label: 'Mi cuenta' },
  { to: '/admin/configuracion', icon: Settings, label: 'Configuracion', permission: 'config.manage' },
  { to: '/admin/personal', icon: UserSquare2, label: 'Personal', permission: 'config.manage' },
  { to: '/admin/whatsapp', icon: MessageSquareMore, label: 'WhatsApp Inbox', permission: 'config.manage' },
  { to: '/admin/usuarios', icon: ShieldCheck, label: 'Usuarios y Roles', permission: 'config.manage' },
];

export default function Sidebar() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [branding, setBranding] = useState({});

  useEffect(() => {
    api.get('/configuracion').then(setBranding).catch(() => {});
    const handleBranding = (event) => setBranding(event.detail || {});
    window.addEventListener('ms-branding-updated', handleBranding);
    return () => window.removeEventListener('ms-branding-updated', handleBranding);
  }, []);

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-screen w-64 flex-col bg-slate-900 text-white">
      <div className="border-b border-slate-700/50 p-5">
        <div className="flex items-center gap-3">
          {branding.negocio_logo ? (
            <img src={branding.negocio_logo} alt="logo" className="h-10 w-10 shrink-0 rounded-xl border border-slate-700 bg-white object-contain p-1" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500">
              <UtensilsCrossed size={20} />
            </div>
          )}
          <div>
            <h1 className="text-base font-bold leading-none">{branding.negocio_nombre || 'Modo Sabor'}</h1>
            <p className="mt-0.5 text-xs text-slate-400">{branding.negocio_localidad ? `${branding.negocio_localidad}, ${branding.negocio_provincia || ''}`.trim().replace(/,\s*$/, '') : 'Sistema de Gestion'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {links.filter((link) => !link.permission || hasPermission(link.permission)).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <ExternalLink size={17} />
          Ver web publica
        </a>
      </nav>

      <div className="border-t border-slate-700/50 p-3">
        <div className="mb-1 flex items-center gap-3 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold">
            {user?.nombre?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.nombre || 'Admin'}</p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => {
            logout();
            navigate('/admin');
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400"
        >
          <LogOut size={15} /> Cerrar sesion
        </button>
      </div>
    </aside>
  );
}
