import { useEffect, useMemo, useState } from 'react';
import { differenceInDays, format, isSameMonth, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Cake,
  Download,
  Eye,
  Gift,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import api from '../lib/api.js';

const CONTROL =
  'h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100';

const EMPTY_FORM = {
  nombre: '',
  telefono: '',
  email: '',
  direccion: '',
  notas: '',
  fecha_nacimiento: '',
  tags: [],
};

const money = (v) => `$${Number(v || 0).toLocaleString('es-AR')}`;
const LEVEL_STEPS = [
  { nivel: 'Bronce', min: 0, next: 'Plata', nextMin: 500 },
  { nivel: 'Plata', min: 500, next: 'Oro', nextMin: 1500 },
  { nivel: 'Oro', min: 1500, next: 'Platino', nextMin: 3000 },
  { nivel: 'Platino', min: 3000, next: null, nextMin: null },
];

function safeDate(value) {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function tone(level) {
  if (level === 'Platino') return '#94a3b8';
  if (level === 'Oro') return '#f59e0b';
  if (level === 'Plata') return '#9ca3af';
  return '#b45309';
}

function rgba(hex, alpha) {
  const clean = (hex || '#f97316').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return `rgba(249,115,22,${alpha})`;
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function rewards(cliente) {
  const totalPedidos = Math.max(0, Number(cliente?.total_pedidos || 0));
  const canjes = Math.max(0, Math.min(Number(cliente?.canjes_premio || 0), Math.floor(totalPedidos / 6)));
  const comprasDisponibles = Math.max(0, totalPedidos - canjes * 6);
  return {
    pendientes: Math.floor(comprasDisponibles / 6),
    sellos: comprasDisponibles % 6,
  };
}

function levelProgress(cliente) {
  const points = Math.max(0, Number(cliente?.puntos || 0));
  const current = LEVEL_STEPS.slice().reverse().find((step) => points >= step.min) || LEVEL_STEPS[0];
  if (!current?.next || !current.nextMin) {
    return {
      current,
      next: null,
      remaining: 0,
      progressPct: 100,
    };
  }

  const span = Math.max(1, current.nextMin - current.min);
  const progress = Math.max(0, Math.min(100, Math.round(((points - current.min) / span) * 100)));
  return {
    current,
    next: LEVEL_STEPS.find((step) => step.nivel === current.next) || null,
    remaining: Math.max(0, current.nextMin - points),
    progressPct: progress,
  };
}

function promoRecommendation(cliente, rewardState, campana, campanaCumple) {
  if (!cliente) return null;
  if (rewardState?.pendientes > 0) {
    return {
      title: 'Premio listo para canjear',
      detail: `Ya puede usar ${rewardState.pendientes} regalo${rewardState.pendientes === 1 ? '' : 's'} por completar compras.`,
      tone: 'emerald',
    };
  }
  if (cliente.cumpleEsteMes) {
    return {
      title: 'Campana de cumple',
      detail: `Conviene enviar saludo con cupón ${campanaCumple?.cupon || 'VOLVE10'} este mes.`,
      tone: 'pink',
    };
  }
  if (cliente.estadoReal === 'Perdido' || cliente.estadoReal === 'Riesgo') {
    return {
      title: 'Promo recomendada',
      detail: `Cliente ideal para reactivar con ${campana?.cupon || 'VOLVE10'} y mensaje de recompra.`,
      tone: 'amber',
    };
  }
  const progress = levelProgress(cliente);
  if (progress.remaining > 0 && progress.next) {
    return {
      title: `Subir a ${progress.next.nivel}`,
      detail: `Le faltan ${progress.remaining} puntos para pasar al siguiente nivel.`,
      tone: 'blue',
    };
  }
  return {
    title: 'Cliente fidelizado',
    detail: 'Mantener contacto con promo suave o beneficio VIP para sostener recompra.',
    tone: 'slate',
  };
}

function promoToneClasses(tone) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (tone === 'pink') return 'border-pink-200 bg-pink-50 text-pink-900';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'blue') return 'border-sky-200 bg-sky-50 text-sky-900';
  return 'border-slate-200 bg-slate-50 text-slate-900';
}

function enrich(cliente) {
  const today = new Date();
  const ultimaCompra = safeDate(cliente?.ultima_compra);
  const fechaNacimiento = safeDate(cliente?.fecha_nacimiento);
  const diasUltimaCompra = ultimaCompra ? differenceInDays(today, ultimaCompra) : 999;
  const frecuencia = Number(cliente?.frecuencia_dias || 7);

  let estadoReal = 'Activo';
  if (diasUltimaCompra > 60) estadoReal = 'Perdido';
  else if (diasUltimaCompra > frecuencia * 2) estadoReal = 'Riesgo';
  else if ((cliente?.total_pedidos || 0) >= 10 || ['Oro', 'Platino'].includes(cliente?.nivel)) estadoReal = 'VIP Activo';

  return {
    ...cliente,
    estadoReal,
    diasUltimaCompra,
    cumpleEsteMes: fechaNacimiento ? isSameMonth(fechaNacimiento, today) : false,
  };
}

function Badge({ children, className = '' }) {
  return <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${className}`}>{children}</span>;
}

function Stat({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/90 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]" style={{ backgroundImage: `linear-gradient(135deg, ${rgba(color, 0.14)}, rgba(255,255,255,0.94) 62%)` }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: rgba(color, 0.16), color }}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [viewMode, setViewMode] = useState('grid');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [campana, setCampana] = useState({ clientes: [], total: 0, dias_inactividad: 15, cupon: '' });
  const [campanaCumple, setCampanaCumple] = useState({ clientes: [], total: 0, cupon: '' });
  const [segmentos, setSegmentos] = useState({ summary: {}, favoritos: [] });
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [sendingBirthdayCampaign, setSendingBirthdayCampaign] = useState(false);

  const cargar = async (query = '') => {
    setLoading(true);
    try {
      setClientes(await api.get(`/clientes${query ? `?search=${encodeURIComponent(query)}` : ''}`));
    } catch (error) {
      toast.error(error?.error || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => cargar(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    cargar();
    api.get('/clientes/campanas/recompra').then(setCampana).catch(() => {});
    api.get('/clientes/campanas/cumpleanos').then(setCampanaCumple).catch(() => {});
    api.get('/clientes/segmentos').then(setSegmentos).catch(() => {});
  }, []);

  const clientesUi = useMemo(() => clientes.map(enrich), [clientes]);
  const detalleReward = useMemo(() => rewards(detalle), [detalle]);
  const detalleLevel = useMemo(() => levelProgress(detalle), [detalle]);
  const detallePromo = useMemo(
    () => promoRecommendation(detalle, detalleReward, campana, campanaCumple),
    [detalle, detalleReward, campana, campanaCumple]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clientesUi.filter((cliente) => {
      const matchSearch =
        !term ||
        cliente.nombre.toLowerCase().includes(term) ||
        String(cliente.telefono || '').includes(term) ||
        String(cliente.direccion || '').toLowerCase().includes(term);
      const matchLevel = filtroNivel === 'Todos' || cliente.nivel === filtroNivel;
      const matchState = filtroEstado === 'Todos' || cliente.estadoReal === filtroEstado;
      return matchSearch && matchLevel && matchState;
    });
  }, [clientesUi, search, filtroNivel, filtroEstado]);

  const stats = useMemo(
    () => ({
      total: clientesUi.length,
      vip: clientesUi.filter((cliente) => ['Oro', 'Platino'].includes(cliente.nivel)).length,
      riesgo: clientesUi.filter((cliente) => cliente.estadoReal === 'Riesgo').length,
      regalos: clientesUi.filter((cliente) => rewards(cliente).pendientes > 0).length,
      cumplen: clientesUi.filter((cliente) => cliente.cumpleEsteMes).length,
      ltv: clientesUi.reduce((acc, cliente) => acc + Number(cliente.total_gastado || 0), 0),
    }),
    [clientesUi]
  );
  const exportarCSV = () => {
    const csv = [
      ['ID', 'Nombre', 'Telefono', 'Email', 'Nivel', 'Puntos', 'Sellos', 'Regalos pendientes', 'Gastado', 'Pedidos', 'Ultima compra', 'Estado', 'Direccion'].join(','),
      ...filtered.map((cliente) =>
        [
          cliente.id,
          `"${cliente.nombre || ''}"`,
          `"${cliente.telefono || ''}"`,
          `"${cliente.email || ''}"`,
          `"${cliente.nivel || ''}"`,
          cliente.puntos || 0,
          rewards(cliente).sellos,
          rewards(cliente).pendientes,
          cliente.total_gastado || 0,
          cliente.total_pedidos || 0,
          `"${cliente.ultima_compra || ''}"`,
          `"${cliente.estadoReal || ''}"`,
          `"${cliente.direccion || ''}"`,
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filtered.length} clientes`);
  };

  const abrirNuevo = () => {
    setForm(EMPTY_FORM);
    setModal('nuevo');
  };

  const abrirEditar = (cliente) => {
    setForm({
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
      notas: cliente.notas || '',
      fecha_nacimiento: cliente.fecha_nacimiento || '',
      tags: cliente.tags || [],
    });
    setModal(cliente);
  };

  const cerrarModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio');
    if (!form.telefono.trim()) return toast.error('El telefono es obligatorio');
    if (!form.direccion.trim()) return toast.error('La direccion es obligatoria');
    setSaving(true);
    const payload = {
      nombre: form.nombre,
      telefono: form.telefono,
      email: form.email || '',
      direccion: form.direccion,
      notas: form.notas || '',
      fecha_nacimiento: form.fecha_nacimiento || '',
      tags: Array.isArray(form.tags) ? form.tags : [],
    };
    try {
      if (modal === 'nuevo') await api.post('/clientes', payload);
      else await api.put(`/clientes/${modal.id}`, payload);
      toast.success(modal === 'nuevo' ? 'Cliente creado' : 'Cliente actualizado');
      cerrarModal();
      await cargar(search.trim());
    } catch (error) {
      toast.error(error?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const abrirDetalle = async (cliente) => {
    try {
      setDetalle(enrich(await api.get(`/clientes/${cliente.id}`)));
    } catch (error) {
      toast.error(error?.error || 'Error al abrir cliente');
    }
  };

  const canjearRegalo = async () => {
    if (!detalle) return;
    try {
      setDetalle(enrich(await api.post(`/clientes/${detalle.id}/canjear-regalo`, {})));
      toast.success('Regalo canjeado correctamente');
      await cargar(search.trim());
    } catch (error) {
      toast.error(error?.error || 'No se pudo canjear el regalo');
    }
  };

  const eliminar = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/clientes/${confirmDelete.id}`);
      toast.success('Cliente eliminado');
      setDetalle((prev) => (prev?.id === confirmDelete.id ? null : prev));
      setConfirmDelete(null);
      await cargar(search.trim());
    } catch (error) {
      toast.error(error?.error || 'Error al eliminar');
    }
  };

  const enviarCampanaRecompra = async (clienteIds) => {
    if (!clienteIds.length) return;
    setSendingCampaign(true);
    try {
      const result = await api.post('/clientes/campanas/recompra/enviar', { cliente_ids: clienteIds, cupon: campana.cupon });
      const manual = result.results?.find((item) => item.mode === 'manual' && item.url);
      if (manual?.url) {
        window.open(manual.url, '_blank', 'noopener,noreferrer');
      }
      toast.success(`Campaña procesada para ${result.enviados || 0} cliente(s)`);
      const updated = await api.get('/clientes/campanas/recompra');
      setCampana(updated);
    } catch (error) {
      toast.error(error?.error || 'No se pudo enviar la campaña');
    } finally {
      setSendingCampaign(false);
    }
  };

  const enviarCampanaCumple = async (clienteIds) => {
    if (!clienteIds.length) return;
    setSendingBirthdayCampaign(true);
    try {
      const result = await api.post('/clientes/campanas/cumpleanos/enviar', { cliente_ids: clienteIds, cupon: campanaCumple.cupon });
      const manual = result.results?.find((item) => item.mode === 'manual' && item.url);
      if (manual?.url) {
        window.open(manual.url, '_blank', 'noopener,noreferrer');
      }
      toast.success(`Campaña de cumpleaños procesada para ${result.enviados || 0} cliente(s)`);
      const updated = await api.get('/clientes/campanas/cumpleanos');
      setCampanaCumple(updated);
    } catch (error) {
      toast.error(error?.error || 'No se pudo enviar la campaña de cumpleaños');
    } finally {
      setSendingBirthdayCampaign(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf9_0%,#f8fafc_40%,#f7f8fb_100%)]">
      <div className="mx-auto max-w-7xl px-6 py-8 xl:px-8">
        <section className="rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,247,237,0.95),rgba(255,255,255,0.92))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-600">CRM Visual</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Clientes</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Fidelizacion automatica, niveles por compras entregadas y premios listos para canjear.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => cargar(search.trim())} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Recargar</button>
              <button type="button" onClick={exportarCSV} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Download size={15} />Exportar CSV</button>
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
                <button type="button" onClick={() => setViewMode('grid')} className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition ${viewMode === 'grid' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutGrid size={14} />Grid</button>
                <button type="button" onClick={() => setViewMode('list')} className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition ${viewMode === 'list' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><List size={14} />Lista</button>
              </div>
              <button type="button" onClick={abrirNuevo} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#f97316,#ea580c)] px-5 text-sm font-bold text-white shadow-[0_16px_30px_rgba(249,115,22,0.28)] transition hover:-translate-y-0.5"><Plus size={15} />Nuevo cliente</button>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Stat label="Total" value={stats.total} icon={UserRound} color="#f97316" />
            <Stat label="VIP" value={stats.vip} icon={Star} color="#f59e0b" />
            <Stat label="En riesgo" value={stats.riesgo} icon={ShieldAlert} color="#ef4444" />
            <Stat label="Regalos" value={stats.regalos} icon={Gift} color="#22c55e" />
            <Stat label="LTV" value={money(stats.ltv)} icon={Download} color="#3b82f6" />
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Programa de fidelidad</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Como suben de nivel y ganan premios</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {LEVEL_STEPS.map((step) => (
                <div key={step.nivel} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{step.nivel}</p>
                  <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{step.nextMin ? `${step.min} - ${step.nextMin - 1} pts` : `${step.min}+ pts`}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{step.next ? `Sube a ${step.next} al llegar a ${step.nextMin} puntos.` : 'Es el nivel maximo del programa.'}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-orange-100 text-orange-700">1 punto cada $100 vendidos</Badge>
              <Badge className="bg-emerald-100 text-emerald-700">1 regalo cada 6 compras entregadas</Badge>
              <Badge className="bg-slate-100 text-slate-700">Los canjes descuentan 6 compras del progreso</Badge>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Promociones activas</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Disparadores rapidos de CRM</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Recompra</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-amber-950">{campana.total || 0}</p>
                <p className="mt-1 text-xs leading-5 text-amber-900">Clientes listos para volver con cupón {campana.cupon || 'VOLVE10'}.</p>
              </div>
              <div className="rounded-2xl border border-pink-200 bg-pink-50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-pink-700">Cumpleaños</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-pink-950">{campanaCumple.total || 0}</p>
                <p className="mt-1 text-xs leading-5 text-pink-900">Clientes para felicitar este mes con campaña afectiva.</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Canje inmediato</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-emerald-950">{stats.regalos}</p>
                <p className="mt-1 text-xs leading-5 text-emerald-900">Clientes con premio disponible para accionar hoy mismo.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Segmentos CRM</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Lectura rapida de la base</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['VIP', segmentos.summary?.vip || 0],
                ['Riesgo', segmentos.summary?.riesgo || 0],
                ['Perdidos', segmentos.summary?.perdidos || 0],
                ['Inactivos', segmentos.summary?.inactivos || 0],
                ['Recurrentes', segmentos.summary?.recurrentes || 0],
                ['Cumple mes', segmentos.summary?.cumpleMes || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Favoritos globales</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Lo que mas tracciona recompra</h2>
            <div className="mt-4 space-y-3">
              {(segmentos.favoritos || []).slice(0, 6).map((item, index) => (
                <div key={`${item.nombre}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-950">{item.nombre}</p>
                    <p className="text-xs text-slate-400">Apariciones en pedidos entregados</p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">{item.veces}</span>
                </div>
              ))}
              {!(segmentos.favoritos || []).length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Todavia no hay favoritos detectados.</div> : null}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">CRM recompra</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Clientes para reactivar</h2>
              <p className="mt-1 text-sm text-slate-500">Sin comprar hace {campana.dias_inactividad || 15} dias o mas. Cupón actual: <strong>{campana.cupon || 'VOLVE10'}</strong>.</p>
            </div>
            <button
              type="button"
              onClick={() => enviarCampanaRecompra(campana.clientes.slice(0, 10).map((cliente) => cliente.id))}
              disabled={sendingCampaign || !campana.clientes.length}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {sendingCampaign ? 'Enviando...' : `Enviar campaña a ${Math.min(campana.clientes.length || 0, 10)}`}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {campana.clientes.slice(0, 6).map((cliente) => (
              <div key={cliente.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">{cliente.nombre}</p>
                    <p className="mt-1 text-xs text-slate-400">{cliente.telefono}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">{cliente.dias_inactivo} dias</span>
                </div>
                <p className="mt-3 text-sm text-slate-500">Ultima compra: {cliente.ultima_compra ? format(parseISO(cliente.ultima_compra), 'dd/MM/yy', { locale: es }) : 'sin datos'}</p>
                <p className="mt-1 text-sm text-slate-500">Gastado: {money(cliente.total_gastado)}</p>
                <button
                  type="button"
                  onClick={() => enviarCampanaRecompra([cliente.id])}
                  disabled={sendingCampaign}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Enviar cupón
                </button>
              </div>
            ))}
            {!campana.clientes.length ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-sm text-slate-500">
                No hay clientes inactivos para campaña en este momento.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">CRM cumpleaños</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Clientes que cumplen este mes</h2>
              <p className="mt-1 text-sm text-slate-500">Ideal para disparar una campaña afectiva con cupón. Cupón actual: <strong>{campanaCumple.cupon || 'VOLVE10'}</strong>.</p>
            </div>
            <button
              type="button"
              onClick={() => enviarCampanaCumple(campanaCumple.clientes.slice(0, 10).map((cliente) => cliente.id))}
              disabled={sendingBirthdayCampaign || !campanaCumple.clientes.length}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-pink-600 px-5 text-sm font-bold text-white transition hover:bg-pink-700 disabled:opacity-50"
            >
              {sendingBirthdayCampaign ? 'Enviando...' : `Felicitar a ${Math.min(campanaCumple.clientes.length || 0, 10)}`}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {campanaCumple.clientes.slice(0, 6).map((cliente) => (
              <div key={`cumple-${cliente.id}`} className="rounded-[24px] border border-pink-200 bg-pink-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">{cliente.nombre}</p>
                    <p className="mt-1 text-xs text-slate-400">{cliente.telefono}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-pink-700">
                    {cliente.fecha_nacimiento ? format(parseISO(cliente.fecha_nacimiento), 'dd/MM', { locale: es }) : 'Este mes'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">Total gastado: {money(cliente.total_gastado)}</p>
                <p className="mt-1 text-sm text-slate-500">Pedidos: {cliente.total_pedidos || 0}</p>
                <button
                  type="button"
                  onClick={() => enviarCampanaCumple([cliente.id])}
                  disabled={sendingBirthdayCampaign}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-4 text-sm font-semibold text-pink-700 transition hover:bg-pink-50 disabled:opacity-50"
                >
                  <Cake size={15} />
                  Enviar saludo
                </button>
              </div>
            ))}
            {!campanaCumple.clientes.length ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-sm text-slate-500">
                No hay cumpleaños cargados para este mes.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-md"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, telefono o direccion..." className={`${CONTROL} w-full pl-11`} /></div>
            <div className="flex flex-col gap-3 sm:flex-row"><select value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)} className={`${CONTROL} min-w-[150px]`}><option value="Todos">Todos los niveles</option><option value="Bronce">Bronce</option><option value="Plata">Plata</option><option value="Oro">Oro</option><option value="Platino">Platino</option></select><select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={`${CONTROL} min-w-[150px]`}><option value="Todos">Todos los estados</option><option value="Activo">Activo</option><option value="VIP Activo">VIP Activo</option><option value="Riesgo">Riesgo</option><option value="Perdido">Perdido</option></select></div>
          </div>
          <div className="mt-5">{loading ? <div className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>{Array.from({ length: viewMode === 'grid' ? 6 : 3 }).map((_, i) => <div key={i} className="h-48 animate-pulse rounded-[24px] bg-slate-100" />)}</div> : filtered.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center"><h3 className="text-lg font-black tracking-tight text-slate-950">No hay resultados</h3><p className="mt-2 text-sm text-slate-500">Proba otro filtro o crea un cliente nuevo.</p></div> : viewMode === 'grid' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((cliente) => { const reward = rewards(cliente); const danger = cliente.estadoReal === 'Perdido' || cliente.estadoReal === 'Riesgo'; return <article key={cliente.id} className="group flex h-full flex-col rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(15,23,42,0.10)]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white text-lg font-black text-slate-900 shadow-sm" style={{ backgroundColor: rgba(tone(cliente.nivel), 0.14) }}>{cliente.nombre.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate text-lg font-black tracking-tight text-slate-950">{cliente.nombre}</h3><p className="mt-1 text-sm text-slate-500">{cliente.telefono || 'Sin telefono'}</p><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: rgba(tone(cliente.nivel), 0.12), color: tone(cliente.nivel) }}>{cliente.nivel}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${danger ? 'bg-rose-50 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{cliente.estadoReal}</span></div></div></div><div className="flex gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100"><button type="button" onClick={() => abrirDetalle(cliente)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><Eye size={15} /></button><button type="button" onClick={() => abrirEditar(cliente)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><Pencil size={15} /></button></div></div><div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-500"><div className="flex items-center gap-2"><MapPin size={14} /><span className="truncate">{cliente.direccion || 'Direccion no cargada'}</span></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Pedidos</p><p className="mt-1 text-xl font-black tracking-tight text-slate-950">{cliente.total_pedidos || 0}</p></div><div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Gastado</p><p className="mt-1 text-xl font-black tracking-tight text-slate-950">{money(cliente.total_gastado)}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><Badge className="bg-slate-100 text-slate-600">{cliente.puntos || 0} puntos</Badge><Badge className={reward.pendientes > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{reward.sellos}/6 sellos</Badge>{reward.pendientes > 0 && <Badge className="bg-emerald-50 text-emerald-700">{reward.pendientes} regalo{reward.pendientes === 1 ? '' : 's'} pendiente{reward.pendientes === 1 ? '' : 's'}</Badge>}{cliente.cumpleEsteMes && <Badge className="bg-pink-50 text-pink-700">Cumple este mes</Badge>}</div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => abrirDetalle(cliente)} className="h-10 rounded-2xl bg-slate-950 text-sm font-bold text-white transition hover:bg-slate-800">Ver ficha</button><button type="button" onClick={() => setConfirmDelete(cliente)} className="h-10 rounded-2xl border border-rose-200 text-sm font-bold text-rose-600 transition hover:bg-rose-50">Eliminar</button></div></article>; })}</div> : <div className="overflow-hidden rounded-[24px] border border-slate-200"><div className="overflow-x-auto"><table className="min-w-full bg-white"><thead className="bg-slate-50"><tr className="text-left"><th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Cliente</th><th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Nivel</th><th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Gastado</th><th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Pedidos</th><th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Sellos</th><th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Estado</th><th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Acciones</th></tr></thead><tbody>{filtered.map((cliente) => { const reward = rewards(cliente); return <tr key={cliente.id} className="border-b border-slate-100 hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white text-sm font-black text-slate-900" style={{ backgroundColor: rgba(tone(cliente.nivel), 0.14) }}>{cliente.nombre.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div><div><p className="font-bold text-slate-900">{cliente.nombre}</p><p className="text-xs text-slate-400">{cliente.telefono || 'Sin telefono'}</p></div></div></td><td className="px-5 py-4"><span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: rgba(tone(cliente.nivel), 0.12), color: tone(cliente.nivel) }}>{cliente.nivel}</span></td><td className="px-5 py-4 text-right font-black text-slate-950">{money(cliente.total_gastado)}</td><td className="px-5 py-4 text-center">{cliente.total_pedidos || 0}</td><td className="px-5 py-4 text-center"><Badge className={reward.pendientes > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{reward.sellos}/6</Badge></td><td className="px-5 py-4 text-center"><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${cliente.estadoReal === 'Perdido' ? 'bg-rose-50 text-rose-700' : cliente.estadoReal === 'Riesgo' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{cliente.estadoReal}</span></td><td className="px-5 py-4 text-right"><div className="flex items-center justify-end gap-1"><button type="button" onClick={() => abrirDetalle(cliente)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><Eye size={15} /></button><button type="button" onClick={() => abrirEditar(cliente)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><Pencil size={15} /></button><button type="button" onClick={() => setConfirmDelete(cliente)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50"><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div></div>}</div>
        </section>
      </div>
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setDetalle(null)}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.26)]" onClick={(e) => e.stopPropagation()}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="h-48" style={{ background: `linear-gradient(135deg, ${rgba(tone(detalle.nivel), 0.28)}, rgba(255,255,255,0.1))` }} />
              <div className="-mt-10 px-5 pb-5">
                <div className="flex items-start justify-between gap-3"><div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white text-2xl font-black text-slate-900 shadow-sm" style={{ backgroundColor: rgba(tone(detalle.nivel), 0.14) }}>{detalle.nombre.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div><button type="button" onClick={() => setDetalle(null)} className="mt-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={16} /></button></div>
                <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{detalle.nombre}</h3>
                <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: rgba(tone(detalle.nivel), 0.12), color: tone(detalle.nivel) }}>{detalle.nivel}</span><Badge className={detalle.estadoReal === 'Perdido' ? 'bg-rose-50 text-rose-700' : detalle.estadoReal === 'Riesgo' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>{detalle.estadoReal}</Badge>{detalle.cumpleEsteMes && <Badge className="bg-pink-50 text-pink-700">Cumple este mes</Badge>}</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Pedidos</p><p className="mt-1 font-semibold text-slate-900">{detalle.total_pedidos || 0}</p></div><div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Gastado</p><p className="mt-1 font-semibold text-slate-900">{money(detalle.total_gastado)}</p></div><div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Puntos</p><p className="mt-1 font-semibold text-slate-900">{detalle.puntos || 0}</p></div><div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Sellos</p><p className="mt-1 font-semibold text-slate-900">{detalleReward.sellos}/6</p></div></div>
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Contacto</p><div className="mt-3 space-y-3"><div className="flex items-center gap-2 text-sm text-slate-700"><Phone size={14} /> {detalle.telefono || 'Sin telefono'}</div><div className="flex items-center gap-2 text-sm text-slate-700"><MapPin size={14} /> {detalle.direccion || 'Sin direccion'}</div>{detalle.email && <div className="flex items-center gap-2 text-sm text-slate-700"><UserRound size={14} /> {detalle.email}</div>}</div></div>
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Fidelizacion</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Nivel actual</p>
                      <p className="mt-1 font-semibold text-slate-900">{detalle.nivel}</p>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Siguiente nivel</p>
                      <p className="mt-1 font-semibold text-slate-900">{detalleLevel.next ? detalleLevel.next.nivel : 'Nivel maximo'}</p>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Frecuencia</p>
                      <p className="mt-1 font-semibold text-slate-900">Cada {detalle.frecuencia_dias || 7} dias</p>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Premios listos</p>
                      <p className="mt-1 font-semibold text-slate-900">{detalleReward.pendientes}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Progreso de nivel</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {detalleLevel.next ? `Faltan ${detalleLevel.remaining} puntos para ${detalleLevel.next.nivel}` : 'Ya esta en el tope del programa'}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{detalle.puntos || 0} pts</span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all" style={{ width: `${detalleLevel.progressPct}%`, backgroundColor: tone(detalle.nivel) }} />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Array.from({ length: 6 }).map((_, i) => <span key={i} className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${i < detalleReward.sellos ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>{i < detalleReward.sellos ? 'OK' : i + 1}</span>)}
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{detalleReward.pendientes > 0 ? `Tiene ${detalleReward.pendientes} regalo${detalleReward.pendientes === 1 ? '' : 's'} pendiente${detalleReward.pendientes === 1 ? '' : 's'} para canjear.` : `Le faltan ${6 - detalleReward.sellos} compra${6 - detalleReward.sellos === 1 ? '' : 's'} entregada${6 - detalleReward.sellos === 1 ? '' : 's'} para completar la tarjeta.`}</p>
                  <div className={`mt-4 rounded-2xl border px-4 py-4 ${promoToneClasses(detallePromo?.tone)}`}>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Promo sugerida</p>
                    <p className="mt-1 font-semibold">{detallePromo?.title}</p>
                    <p className="mt-1 text-sm leading-6 opacity-80">{detallePromo?.detail}</p>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">Los niveles, puntos, sellos y regalos se recalculan automaticamente desde pedidos entregados. Regla base: 1 punto cada $100 y 1 premio cada 6 compras.</p>
                  {detalleReward.pendientes > 0 && <button type="button" onClick={canjearRegalo} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700"><Gift size={15} />Canjear regalo</button>}
                </div>
                {detalle.notas && <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">{detalle.notas}</div>}
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Ultimos pedidos</p><div className="mt-3 space-y-2">{detalle.pedidos?.length ? detalle.pedidos.map((pedido) => <div key={pedido.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"><div><p className="font-semibold text-slate-900">#{pedido.numero || pedido.id}</p><p className="text-xs text-slate-400">{pedido.creado_en ? format(parseISO(pedido.creado_en), 'dd/MM/yy HH:mm', { locale: es }) : 'Sin fecha'}</p></div><div className="text-right"><p className="font-bold text-slate-900">{money(pedido.total)}</p><p className="text-xs capitalize text-slate-400">{pedido.estado}</p></div></div>) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">Todavia no tiene pedidos registrados.</div>}</div></div>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDetalle(null)} className="h-11 rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Cerrar</button><button type="button" onClick={() => { const current = detalle; setDetalle(null); abrirEditar(current); }} className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800">Editar cliente</button></div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={cerrarModal}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.26)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{modal === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}</p><h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">{modal === 'nuevo' ? 'Crear cliente' : 'Ajustar cliente'}</h2></div><button type="button" onClick={cerrarModal} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"><X size={16} /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="mb-4 rounded-[22px] border border-orange-100 bg-orange-50/70 px-4 py-3 text-sm text-orange-900"><p className="font-bold">Fidelizacion automatica</p><p className="mt-1 leading-6 text-orange-800">Nivel, puntos, sellos, regalos y frecuencia se calculan automaticamente en base a pedidos entregados. Desde aca solo editas datos del cliente.</p></div><div className="grid gap-4 md:grid-cols-2"><input value={form.nombre} onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))} placeholder="Nombre completo" className={`${CONTROL} w-full`} /><input value={form.telefono} onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))} placeholder="Telefono" className={`${CONTROL} w-full`} /><input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className={`${CONTROL} w-full`} /><input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm((prev) => ({ ...prev, fecha_nacimiento: e.target.value }))} className={`${CONTROL} w-full`} /><textarea value={form.direccion} onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))} rows={3} placeholder="Direccion" className="min-h-[112px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100 md:col-span-2" /><textarea value={form.notas} onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))} rows={4} placeholder="Notas internas, alergias, referencias o comentarios utiles" className="min-h-[128px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100 md:col-span-2" /></div></div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={cerrarModal} className="h-11 rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button><button type="button" onClick={guardar} disabled={saving} className="h-11 rounded-2xl bg-[linear-gradient(135deg,#f97316,#ea580c)] px-5 text-sm font-bold text-white shadow-[0_16px_26px_rgba(249,115,22,0.24)] transition hover:-translate-y-0.5 disabled:opacity-60">{saving ? 'Guardando...' : modal === 'nuevo' ? 'Crear cliente' : 'Guardar cambios'}</button></div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.26)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600"><AlertTriangle size={28} /></div>
            <h3 className="mt-4 text-center text-xl font-black tracking-tight text-slate-950">Eliminar cliente</h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-500">Se eliminara a "{confirmDelete.nombre}" de la base de clientes. Esta accion no se puede deshacer.</p>
            <div className="mt-6 flex gap-2"><button type="button" onClick={() => setConfirmDelete(null)} className="h-11 flex-1 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button><button type="button" onClick={eliminar} className="h-11 flex-1 rounded-2xl bg-rose-600 text-sm font-bold text-white transition hover:bg-rose-700">Eliminar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
