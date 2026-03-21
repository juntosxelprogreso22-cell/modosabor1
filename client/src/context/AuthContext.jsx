import { createContext, useContext, useState, useEffect } from 'react';
import { getPermissionsForRole, hasPermission as canUser } from '../lib/permissions.js';
const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('ms_token');
    const u = localStorage.getItem('ms_user');
    if (!t || !u) {
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(u);
    if (!parsed.permissions) parsed.permissions = getPermissionsForRole(parsed.rol);
    setToken(t);
    setUser(parsed);

    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${t}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Sesion invalida');
        const fresh = await response.json();
        const normalized = { ...fresh, permissions: fresh.permissions || getPermissionsForRole(fresh.rol) };
        localStorage.setItem('ms_user', JSON.stringify(normalized));
        setUser(normalized);
      })
      .catch(() => {
        localStorage.removeItem('ms_token');
        localStorage.removeItem('ms_user');
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = (t, u) => {
    const normalized = { ...u, permissions: u.permissions || getPermissionsForRole(u.rol) };
    localStorage.setItem('ms_token', t);
    localStorage.setItem('ms_user', JSON.stringify(normalized));
    setToken(t); setUser(normalized);
  };

  const logout = () => {
    localStorage.removeItem('ms_token');
    localStorage.removeItem('ms_user');
    setToken(null); setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, loading, login, logout, isAuth: !!token, hasPermission: (permission) => canUser(user, permission) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
