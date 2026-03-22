import { useState, useEffect } from 'react';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { Download, RefreshCcw, Save } from 'lucide-react';
import { applyBranding } from '../lib/branding.js';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIAS_LABELS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function parseDeliveryZones(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTurnos(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Configuracion() {
  const [config, setConfig] = useState({});
  const [logo, setLogo] = useState(null);
  const [favicon, setFavicon] = useState(null);
  const [horarios, setHorarios] = useState({});
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mpStatus, setMpStatus] = useState(null);
  const [testingMp, setTestingMp] = useState(false);
  const [syncingMp, setSyncingMp] = useState(false);
  const [mpPending, setMpPending] = useState([]);
  const [mpEvents, setMpEvents] = useState([]);
  const [waStatus, setWaStatus] = useState(null);
  const [testingWa, setTestingWa] = useState(false);
  const [sendingWaTest, setSendingWaTest] = useState(false);
  const [waConversations, setWaConversations] = useState([]);
  const [printingTest, setPrintingTest] = useState(false);
  const [turnos, setTurnos] = useState([]);
  const [backups, setBackups] = useState([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState('');
  const [resettingData, setResettingData] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');

  useEffect(() => {
    api.get('/configuracion/admin').then((data) => {
      setConfig(data);
      setDeliveryZones(parseDeliveryZones(data.delivery_zonas));
      setTurnos(parseTurnos(data.turnos_negocio));
      try {
        setHorarios(JSON.parse(data.horarios || '{}'));
      } catch {
        setHorarios({});
      }
    });
    api.get('/whatsapp/conversaciones').then(setWaConversations).catch(() => {});
    api.get('/configuracion/backups').then((data) => setBackups(data.backups || [])).catch(() => {});
  }, []);

  const guardar = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      const { horarios: _, ...rest } = config;
      Object.entries(rest).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, v);
      });
      fd.set('horarios', JSON.stringify(horarios));
      fd.set('turnos_negocio', JSON.stringify(turnos));
      fd.set('delivery_zonas', JSON.stringify(deliveryZones));
      if (logo) fd.append('logo', logo);
      if (favicon) fd.append('favicon', favicon);
      const updated = await api.put('/configuracion', fd);
      setConfig(updated);
      applyBranding(updated);
      window.dispatchEvent(new CustomEvent('ms-branding-updated', { detail: updated }));
      toast.success('Configuracion guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const f = (key) => ({
    value: config[key] || '',
    onChange: (e) => setConfig((p) => ({ ...p, [key]: e.target.value })),
    className: 'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500',
  });

  const setToggle = (key, checked) => {
    setConfig((prev) => ({ ...prev, [key]: checked ? '1' : '0' }));
  };

  const updateZone = (index, field, value) => {
    setDeliveryZones((prev) => prev.map((zone, zoneIndex) => {
      if (zoneIndex !== index) return zone;
      return { ...zone, [field]: value };
    }));
  };

  const addZone = () => {
    setDeliveryZones((prev) => [
      ...prev,
      {
        id: `zona_${Date.now()}`,
        nombre: '',
        keywords: [],
        costo_envio: 0,
        tiempo_estimado_min: 30,
        activa: true,
      },
    ]);
  };

  const removeZone = (index) => {
    setDeliveryZones((prev) => prev.filter((_, zoneIndex) => zoneIndex !== index));
  };

  const applyMonterosPreset = () => {
    setConfig((prev) => ({
      ...prev,
      negocio_localidad: 'Monteros',
      negocio_provincia: 'Tucuman',
      negocio_codigo_postal: '4142',
      negocio_direccion: prev.negocio_direccion || 'Monteros, Tucuman',
      moneda_simbolo: prev.moneda_simbolo || '$',
      moneda_codigo: prev.moneda_codigo || 'ARS',
      costo_envio_base: '0',
      tiempo_delivery: '25',
    }));
    setDeliveryZones([
      {
        id: 'monteros',
        nombre: 'Monteros',
        keywords: ['monteros', 'centro', 'casco centrico', 'las piedras'],
        costo_envio: 0,
        tiempo_estimado_min: 25,
        activa: true,
      },
      {
        id: 'cerca',
        nombre: 'Fuera de Monteros - cerca',
        keywords: ['santa lucia', 'santalucia', 'villa quinteros'],
        costo_envio: 1500,
        tiempo_estimado_min: 40,
        activa: true,
      },
      {
        id: 'extendida',
        nombre: 'Fuera de Monteros - extendida',
        keywords: ['ruta', 'km', 'afuera', 'rio seco', 'famailla', 'concepcion'],
        costo_envio: 2500,
        tiempo_estimado_min: 55,
        activa: true,
      },
    ]);
    toast.success('Preset Monteros aplicado. Guardalo para dejarlo fijo.');
  };

  const probarMercadoPago = async () => {
    setTestingMp(true);
    try {
      const status = await api.get('/configuracion/mercadopago/status');
      setMpStatus(status);
      const pending = await api.get('/pedidos/pagos/mercadopago/pendientes');
      const events = await api.get('/configuracion/mercadopago/eventos');
      setMpPending(pending);
      setMpEvents(events);
      toast.success(status.message || 'Chequeo completado');
    } catch {
      toast.error('No se pudo validar MercadoPago');
    } finally {
      setTestingMp(false);
    }
  };

  const sincronizarPendientesMp = async () => {
    setSyncingMp(true);
    try {
      const result = await api.post('/pedidos/pagos/mercadopago/sync-pendientes');
      const pending = await api.get('/pedidos/pagos/mercadopago/pendientes');
      setMpPending(pending);
      toast.success(`Sincronizados ${result.synced || 0} de ${result.total || 0} pagos pendientes`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo sincronizar MercadoPago');
    } finally {
      setSyncingMp(false);
    }
  };

  const probarWhatsApp = async () => {
    setTestingWa(true);
    try {
      const status = await api.get('/configuracion/whatsapp/status');
      setWaStatus(status);
      toast.success(status.message || 'Chequeo completado');
    } catch {
      toast.error('No se pudo validar WhatsApp');
    } finally {
      setTestingWa(false);
    }
  };

  const enviarPruebaWhatsApp = async () => {
    setSendingWaTest(true);
    try {
      const result = await api.post('/configuracion/whatsapp/test', {
        telefono: config.whatsapp_test_destino || '',
      });
      toast.success(result.message || 'Mensaje enviado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo enviar la prueba');
    } finally {
      setSendingWaTest(false);
    }
  };

  const probarImpresionA6 = async () => {
    setPrintingTest(true);
    try {
      const document = await api.get('/configuracion/impresion/test');
      const popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        toast.error('Permiti las ventanas emergentes para imprimir la prueba');
        return;
      }
      popup.document.open();
      popup.document.write(document.html);
      popup.document.close();
      toast.success('Prueba A6 lista para imprimir');
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la prueba A6');
    } finally {
      setPrintingTest(false);
    }
  };

  const cargarBackups = async () => {
    try {
      const data = await api.get('/configuracion/backups');
      setBackups(data.backups || []);
    } catch {
      toast.error('No se pudo cargar la lista de backups');
    }
  };

  const crearBackup = async () => {
    setCreatingBackup(true);
    try {
      const backup = await api.post('/configuracion/backups', {});
      toast.success('Backup creado correctamente');
      setBackups((prev) => [backup, ...prev].slice(0, 20));
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear el backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const descargarBackup = (file) => {
    window.open(`/api/configuracion/backups/${encodeURIComponent(file)}/download`, '_blank');
  };

  const restaurarBackup = async (file) => {
    const confirmacion = window.prompt(`Escribi RESTAURAR para recuperar ${file}. Antes de restaurar se genera una copia de seguridad actual.`, '');
    if (String(confirmacion || '').trim().toUpperCase() !== 'RESTAURAR') {
      toast.error('Restauracion cancelada');
      return;
    }
    setRestoringBackup(file);
    try {
      const result = await api.post(`/configuracion/backups/${encodeURIComponent(file)}/restore`, { confirmacion });
      toast.success(result.message || 'Backup restaurado');
      setBackups(result.backups || []);
      const adminConfig = await api.get('/configuracion/admin');
      setConfig(adminConfig);
      setDeliveryZones(parseDeliveryZones(adminConfig.delivery_zonas));
      setTurnos(parseTurnos(adminConfig.turnos_negocio));
      try {
        setHorarios(JSON.parse(adminConfig.horarios || '{}'));
      } catch {
        setHorarios({});
      }
      applyBranding(adminConfig);
      window.dispatchEvent(new CustomEvent('ms-branding-updated', { detail: adminConfig }));
    } catch (error) {
      toast.error(error?.error || 'No se pudo restaurar el backup');
    } finally {
      setRestoringBackup('');
    }
  };

  const ejecutarReset = async () => {
    if (resetConfirm.trim().toUpperCase() !== 'RESET') {
      toast.error('Escribi RESET para confirmar');
      return;
    }
    setResettingData(true);
    try {
      const result = await api.post('/configuracion/reset', { confirmacion: resetConfirm });
      setResetConfirm('');
      toast.success(result.message || 'Reset completado');
      await cargarBackups();
    } catch (error) {
      toast.error(error?.error || 'No se pudo resetear la operacion');
    } finally {
      setResettingData(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuracion</h1>
          <p className="text-sm text-gray-500">Personaliza tu sistema</p>
        </div>
        <button onClick={guardar} disabled={loading} className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
          <Save size={16} /> {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Datos del negocio</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Nombre del negocio</label>
            <input {...f('negocio_nombre')} />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Descripcion / Slogan</label>
            <input {...f('negocio_descripcion')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Direccion</label>
            <input {...f('negocio_direccion')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Localidad</label>
            <input {...f('negocio_localidad')} placeholder="Monteros" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Provincia</label>
            <input {...f('negocio_provincia')} placeholder="Tucuman" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Codigo postal</label>
            <input {...f('negocio_codigo_postal')} placeholder="4142" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Telefono / WhatsApp</label>
            <input {...f('negocio_telefono')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Email</label>
            <input {...f('negocio_email')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Numero WhatsApp (sin +)</label>
            <input {...f('whatsapp_numero')} placeholder="5491112345678" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Simbolo moneda</label>
            <input {...f('moneda_simbolo')} placeholder="$" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Codigo moneda</label>
            <input {...f('moneda_codigo')} placeholder="ARS" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Color principal</label>
            <input type="color" value={config.color_primario || '#f97316'} onChange={(e) => setConfig((prev) => ({ ...prev, color_primario: e.target.value }))} className="h-11 w-full rounded-xl border border-gray-200 bg-white p-1" />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Logo</label>
            <div className="flex items-center gap-4">
              {config.negocio_logo ? <img src={config.negocio_logo} alt="logo" className="h-16 rounded-xl border border-gray-200 p-1 object-contain" /> : null}
              <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} className="text-sm" />
            </div>
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Favicon</label>
            <div className="flex items-center gap-4">
              {config.negocio_favicon ? <img src={config.negocio_favicon} alt="favicon" className="h-10 w-10 rounded-xl border border-gray-200 bg-white p-1 object-contain" /> : null}
              <input type="file" accept=".ico,image/png,image/svg+xml,image/x-icon" onChange={(e) => setFavicon(e.target.files[0])} className="text-sm" />
            </div>
            <p className="mt-2 text-xs text-gray-500">Se aplica al navegador y al panel para un branding mas prolijo.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Delivery y tiempos</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Costo envio base ($)</label>
            <input type="number" {...f('costo_envio_base')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Tiempo delivery (min)</label>
            <input type="number" {...f('tiempo_delivery')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Tiempo retiro (min)</label>
            <input type="number" {...f('tiempo_retiro')} />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
          <input
            type="checkbox"
            checked={config.delivery_validacion_activa === '1'}
            onChange={(e) => setToggle('delivery_validacion_activa', e.target.checked)}
            className="mt-1 h-4 w-4 accent-orange-500"
          />
          <div>
            <p className="text-sm font-semibold text-gray-800">Validar direccion por zona</p>
            <p className="mt-1 text-xs text-gray-500">Si esta activo, solo se aceptan direcciones que coincidan con una zona configurada.</p>
          </div>
        </label>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
          <input
            type="checkbox"
            checked={config.delivery_requiere_foto_entrega === '1'}
            onChange={(e) => setToggle('delivery_requiere_foto_entrega', e.target.checked)}
            className="mt-1 h-4 w-4 accent-orange-500"
          />
          <div>
            <p className="text-sm font-semibold text-gray-800">Exigir foto al marcar entregado</p>
            <p className="mt-1 text-xs text-gray-500">El rider tendra que subir una foto de entrega antes de cerrar el pedido.</p>
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-900">Zonas de delivery</h2>
            <p className="mt-1 text-xs text-gray-500">Cada zona usa palabras clave para detectar la direccion, costo propio y demora estimada.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={applyMonterosPreset}
              className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
            >
              Preset Monteros
            </button>
            <button
              onClick={addZone}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Agregar zona
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {deliveryZones.map((zone, index) => (
            <div key={zone.id || index} className="rounded-2xl border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800">Zona {index + 1}</p>
                <button
                  onClick={() => removeZone(index)}
                  className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                >
                  Eliminar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Nombre</label>
                  <input
                    value={zone.nombre || ''}
                    onChange={(e) => updateZone(index, 'nombre', e.target.value)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Centro"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                  <input
                    type="checkbox"
                    checked={zone.activa !== false}
                    onChange={(e) => updateZone(index, 'activa', e.target.checked)}
                    className="mt-1 h-4 w-4 accent-orange-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Zona activa</p>
                    <p className="mt-1 text-xs text-gray-500">Solo las zonas activas participan de la deteccion.</p>
                  </div>
                </label>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Costo envio</label>
                  <input
                    type="number"
                    min="0"
                    value={zone.costo_envio ?? 0}
                    onChange={(e) => updateZone(index, 'costo_envio', Number(e.target.value || 0))}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Tiempo estimado (min)</label>
                  <input
                    type="number"
                    min="0"
                    value={zone.tiempo_estimado_min ?? 0}
                    onChange={(e) => updateZone(index, 'tiempo_estimado_min', Number(e.target.value || 0))}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Palabras clave</label>
                  <textarea
                    value={Array.isArray(zone.keywords) ? zone.keywords.join(', ') : ''}
                    onChange={(e) => updateZone(index, 'keywords', e.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                    rows={2}
                    className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="centro, microcentro, barrio norte"
                  />
                  <p className="mt-1 text-xs text-gray-500">Separalas por coma. Si la direccion contiene alguna, se asigna esa zona.</p>
                </div>
              </div>
            </div>
          ))}
          {deliveryZones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Todavia no cargaste zonas. Podes agregar una o guardar las sugeridas que ya vienen por defecto.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Salon y mesas</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Cantidad de mesas</label>
            <input type="number" min="1" {...f('mesas_cantidad')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Nombres personalizados</label>
            <textarea
              value={config.mesas_nombres || ''}
              onChange={(e) => setConfig((p) => ({ ...p, mesas_nombres: e.target.value }))}
              rows={3}
              placeholder={'1, 2, 3, VIP, Patio 1'}
              className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="mt-1 text-xs text-gray-500">Opcional. Podes separarlas por coma o por linea. Si lo dejas vacio, se generan numeradas automaticamente.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Pagos y transferencias</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">CBU / Alias</label>
            <input {...f('cbu_alias')} placeholder="modosabor.mp" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Access Token MercadoPago</label>
            <input {...f('mercadopago_token')} type="password" placeholder="APP_USR-..." />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">URL publica app</label>
            <input {...f('public_app_url')} placeholder="https://tudominio.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">URL publica API</label>
            <input {...f('public_api_url')} placeholder="https://api.tudominio.com" />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
          <input
            type="checkbox"
            checked={config.mercadopago_binary_mode === '1'}
            onChange={(e) => setToggle('mercadopago_binary_mode', e.target.checked)}
            className="mt-1 h-4 w-4 accent-orange-500"
          />
          <div>
            <p className="text-sm font-semibold text-gray-800">Modo binario en MercadoPago</p>
            <p className="mt-1 text-xs text-gray-500">Si esta activo, el pago intenta resolverse como aprobado o rechazado, evitando estados intermedios largos.</p>
          </div>
        </label>
        <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Diagnostico MercadoPago</p>
              <p className="mt-1 text-xs text-gray-500">Valida token, cuenta y URLs publicas para checkout y webhook.</p>
            </div>
            <button
              onClick={probarMercadoPago}
              disabled={testingMp}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {testingMp ? 'Probando...' : 'Probar MercadoPago'}
            </button>
          </div>
          {mpStatus ? (
            <div className="mt-4 space-y-3">
              <div className={`rounded-xl px-3 py-3 text-sm font-semibold ${mpStatus.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {mpStatus.message}
              </div>
              <div className={`rounded-xl px-3 py-3 text-sm font-semibold ${mpStatus.production_ready ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {mpStatus.production_message}
              </div>
              {mpStatus.account ? (
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-gray-600">
                  <p><strong>Cuenta:</strong> {mpStatus.account.nickname || mpStatus.account.email}</p>
                  <p><strong>Email:</strong> {mpStatus.account.email}</p>
                  <p><strong>Site:</strong> {mpStatus.account.site_id}</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(mpStatus.checks || {}).map(([key, ok]) => (
                  <div key={key} className={`rounded-xl px-3 py-2 font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {key}: {ok ? 'OK' : 'Falta'}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(mpStatus.production_checks || {}).map(([key, ok]) => (
                  <div key={key} className={`rounded-xl px-3 py-2 font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {key}: {ok ? 'OK' : 'Revisar'}
                  </div>
                ))}
              </div>
              {mpStatus.webhook_url ? (
                <div className="rounded-xl bg-white px-3 py-3 text-xs text-gray-500 break-all">
                  <strong>Webhook:</strong> {mpStatus.webhook_url}
                </div>
              ) : null}
              <div className="rounded-xl bg-white px-3 py-3 text-sm text-gray-600">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">Pagos pendientes de revision</p>
                    <p className="mt-1 text-xs text-gray-500">{mpPending.length} pedido(s) con MercadoPago pendiente o en proceso.</p>
                  </div>
                  <button
                    onClick={sincronizarPendientesMp}
                    disabled={syncingMp}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {syncingMp ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                </div>
                {mpPending.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {mpPending.slice(0, 5).map((pedido) => (
                      <div key={pedido.id} className="rounded-xl border border-slate-200 px-3 py-3 text-xs text-slate-600">
                        <strong>Pedido #{pedido.numero}</strong> - estado pago {pedido.pago_estado || 'pending'} - total {pedido.total}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {mpEvents.length > 0 ? (
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-gray-600">
                  <p className="font-semibold text-gray-800">Ultimos eventos MercadoPago</p>
                  <div className="mt-3 space-y-2">
                    {mpEvents.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        <strong>{item.tipo}</strong> · {item.estado || 'sin estado'} · pedido {item.pedido_id || '-'} · payment {item.payment_id || '-'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Mensaje de confirmacion</h2>
        <textarea
          value={config.mensaje_confirmacion || ''}
          onChange={(e) => setConfig((p) => ({ ...p, mensaje_confirmacion: e.target.value }))}
          rows={3}
          className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">WhatsApp y notificaciones</h2>
        <div className="space-y-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
            <input
              type="checkbox"
              checked={config.whatsapp_notificaciones_auto === '1'}
              onChange={(e) => setToggle('whatsapp_notificaciones_auto', e.target.checked)}
              className="mt-1 h-4 w-4 accent-orange-500"
            />
            <div>
              <p className="text-sm font-semibold text-gray-800">Notificaciones automaticas</p>
              <p className="mt-1 text-xs text-gray-500">En modo manual deja mensajes listos o abre WhatsApp. En modo API envia solo cuando el backend tiene credenciales oficiales.</p>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Modo de envio</label>
              <select
                value={config.whatsapp_modo_envio || 'manual'}
                onChange={(e) => setConfig((p) => ({ ...p, whatsapp_modo_envio: e.target.value }))}
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="manual">Manual (wa.me)</option>
                <option value="api">API oficial</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Proveedor</label>
              <input {...f('whatsapp_api_provider')} placeholder="meta" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={config.whatsapp_bot_activo === '1'}
                onChange={(e) => setToggle('whatsapp_bot_activo', e.target.checked)}
                className="mt-1 h-4 w-4 accent-orange-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">Bot de WhatsApp activo</p>
                <p className="mt-1 text-xs text-gray-500">Responde consultas basicas de menu, productos, seguimiento y deriva a humano.</p>
              </div>
            </label>

            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Verify token del webhook</label>
              <input {...f('whatsapp_webhook_verify_token')} placeholder="modo-sabor-bot" />
              <p className="mt-2 text-xs text-gray-500 break-all">
                Webhook Meta: {`${config.public_api_url || 'http://localhost:3001'}/api/whatsapp/webhook`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={config.whatsapp_ai_activa === '1'}
                onChange={(e) => setToggle('whatsapp_ai_activa', e.target.checked)}
                className="mt-1 h-4 w-4 accent-orange-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">IA conversacional activa</p>
                <p className="mt-1 text-xs text-gray-500">Si esta activa y hay clave OpenAI, el bot pasa de respuestas fijas a flujo conversacional con armado de pedido.</p>
              </div>
            </label>

            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Modelo OpenAI</label>
              <input {...f('whatsapp_ai_modelo')} placeholder="gpt-5-mini" />
              <label className="mb-1.5 mt-3 block text-xs font-semibold text-gray-600">OpenAI API Key</label>
              <input {...f('openai_api_key')} type="password" placeholder="sk-..." />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Link directo para pedir</label>
              <input {...f('whatsapp_bot_link_pedidos')} placeholder="https://tudominio.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Mensaje bienvenida bot</label>
              <textarea
                value={config.whatsapp_bot_bienvenida || ''}
                onChange={(e) => setConfig((p) => ({ ...p, whatsapp_bot_bienvenida: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Mensaje fallback bot</label>
              <textarea
                value={config.whatsapp_bot_fallback || ''}
                onChange={(e) => setConfig((p) => ({ ...p, whatsapp_bot_fallback: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Mensaje derivacion humano</label>
              <textarea
                value={config.whatsapp_bot_humano || ''}
                onChange={(e) => setConfig((p) => ({ ...p, whatsapp_bot_humano: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
            {config.whatsapp_modo_envio === 'api' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Version API</label>
                  <input {...f('whatsapp_api_version')} placeholder="v23.0" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Phone Number ID</label>
                  <input {...f('whatsapp_phone_number_id')} placeholder="123456789012345" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Access Token WhatsApp</label>
                  <input {...f('whatsapp_api_token')} type="password" placeholder="EAAG..." />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Telefono prueba</label>
                  <input {...f('whatsapp_test_destino')} placeholder="5491112345678" />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El modo actual es <strong>manual</strong>. Asi el sistema no puede responder mensajes entrantes por bot o IA.
                Para respuestas automaticas tenes que pasar a <strong>API oficial</strong> y cargar token + Phone Number ID.
              </div>
            )}

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Diagnostico WhatsApp</p>
                <p className="mt-1 text-xs text-gray-500">Te dice si el bot realmente puede responder y si la IA tiene lo minimo para entrar en juego.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={probarWhatsApp}
                  disabled={testingWa}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  {testingWa ? 'Probando...' : 'Probar WhatsApp'}
                </button>
                <button
                  onClick={enviarPruebaWhatsApp}
                  disabled={sendingWaTest || config.whatsapp_modo_envio !== 'api'}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  {sendingWaTest ? 'Enviando...' : 'Enviar prueba'}
                </button>
              </div>
            </div>

            {waStatus ? (
              <div className="space-y-3">
                <div className={`rounded-xl px-3 py-3 text-sm font-semibold ${waStatus.bot_ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {waStatus.message}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`rounded-xl px-3 py-2 font-semibold ${waStatus.bot_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    bot_enabled: {waStatus.bot_enabled ? 'OK' : 'Off'}
                  </div>
                  <div className={`rounded-xl px-3 py-2 font-semibold ${waStatus.bot_ready ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    bot_ready: {waStatus.bot_ready ? 'OK' : 'Bloqueado'}
                  </div>
                  <div className={`rounded-xl px-3 py-2 font-semibold ${waStatus.ai_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    ai_enabled: {waStatus.ai_enabled ? 'OK' : 'Off'}
                  </div>
                  <div className={`rounded-xl px-3 py-2 font-semibold ${waStatus.ai_ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    ai_ready: {waStatus.ai_ready ? 'OK' : 'Pendiente'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(waStatus.checks || {}).map(([key, ok]) => (
                    <div key={key} className={`rounded-xl px-3 py-2 font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {key}: {ok ? 'OK' : 'Falta'}
                    </div>
                  ))}
                  {Object.entries(waStatus.ai_checks || {}).map(([key, ok]) => (
                    <div key={key} className={`rounded-xl px-3 py-2 font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {key}: {ok ? 'OK' : 'Falta'}
                    </div>
                  ))}
                </div>
                {waStatus.blocking_reason ? (
                  <div className="rounded-xl bg-white px-3 py-3 text-xs text-gray-600">
                    <strong>Bloqueo:</strong> {waStatus.blocking_reason}
                  </div>
                ) : null}
                {waStatus.webhook_url ? (
                  <div className="rounded-xl bg-white px-3 py-3 text-xs text-gray-600 break-all">
                    <strong>Webhook:</strong> {waStatus.webhook_url}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {waConversations.length > 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Conversaciones recientes</p>
                  <p className="mt-1 text-xs text-gray-500">Sirve para confirmar que el bot esta atendiendo y ver escalados a humano.</p>
                </div>
                <button
                  onClick={() => api.get('/whatsapp/conversaciones').then(setWaConversations).catch(() => {})}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Recargar
                </button>
              </div>
              <div className="space-y-2">
                {waConversations.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-xl bg-white px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{item.nombre || item.telefono}</p>
                        <p className="text-xs text-gray-500">{item.telefono}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">{item.ultimo_estado || 'nuevo'}</span>
                        {item.escalado_humano ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">Humano</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            Variables disponibles: <strong>{'{{cliente}}'}</strong>, <strong>{'{{numero}}'}</strong>, <strong>{'{{negocio}}'}</strong>, <strong>{'{{total}}'}</strong>, <strong>{'{{seguimiento_url}}'}</strong>, <strong>{'{{tiempo_estimado}}'}</strong>, <strong>{'{{repartidor}}'}</strong>, <strong>{'{{resena_url}}'}</strong>, <strong>{'{{cupon}}'}</strong>, <strong>{'{{pedido_url}}'}</strong>.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Link de resena</label>
              <input {...f('postventa_url_resena')} placeholder="https://g.page/r/..." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Cupon recompra</label>
              <input {...f('postventa_cupon_recompra')} placeholder="VOLVE10" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Dias para marcar inactivo</label>
              <input type="number" min="1" {...f('crm_dias_inactividad')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Cupon campaña recompra</label>
              <input {...f('crm_cupon_recompra')} placeholder="VOLVE10" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Mensaje campaña recompra</label>
            <textarea
              value={config.crm_mensaje_recompra || ''}
              onChange={(e) => setConfig((p) => ({ ...p, crm_mensaje_recompra: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[
              ['whatsapp_mensaje_nuevo', 'Pedido recibido'],
              ['whatsapp_mensaje_confirmado', 'Pedido confirmado'],
              ['whatsapp_mensaje_preparando', 'Pedido preparando'],
              ['whatsapp_mensaje_listo', 'Pedido listo'],
              ['whatsapp_mensaje_en_camino', 'Pedido en camino'],
              ['whatsapp_mensaje_entregado', 'Pedido entregado'],
              ['whatsapp_mensaje_cancelado', 'Pedido cancelado'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</label>
                <textarea
                  value={config[key] || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.value }))}
                  rows={2}
                  className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Impresion</h2>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={config.impresion_auto_tpv === '1'}
                onChange={(e) => setToggle('impresion_auto_tpv', e.target.checked)}
                className="mt-1 h-4 w-4 accent-orange-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">Autoimpresion en TPV</p>
                <p className="mt-1 text-xs text-gray-500">Al confirmar una venta en caja se imprime la comanda automaticamente.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={config.impresion_auto_web === '1'}
                onChange={(e) => setToggle('impresion_auto_web', e.target.checked)}
                className="mt-1 h-4 w-4 accent-orange-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">Autoimpresion pedidos web</p>
                <p className="mt-1 text-xs text-gray-500">Si la pantalla de pedidos esta abierta, al entrar un pedido web dispara la comanda sola.</p>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Formato</label>
              <input {...f('impresion_formato')} placeholder="a6" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Copias comanda</label>
              <input type="number" min="1" {...f('impresion_copias_comanda')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Copias ticket</label>
              <input type="number" min="1" {...f('impresion_copias_ticket')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Margen hoja (mm)</label>
              <input type="number" min="2" max="20" step="1" {...f('impresion_margen_mm')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Escala de fuente</label>
              <input type="number" min="0.8" max="1.4" step="0.05" {...f('impresion_escala_fuente')} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Mensaje del ticket</label>
            <textarea
              value={config.impresion_mensaje_ticket || ''}
              onChange={(e) => setConfig((p) => ({ ...p, impresion_mensaje_ticket: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Prueba A6</p>
                <p className="mt-1 text-xs text-gray-500">Genera una hoja de prueba con texto, items y medidas para calibrar tu impresora hogareña.</p>
              </div>
              <button
                onClick={probarImpresionA6}
                disabled={printingTest}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {printingTest ? 'Generando...' : 'Probar impresion A6'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Turnos del negocio</h2>
        <p className="mb-4 text-sm text-gray-500">Estos turnos sirven para mostrar apertura, ordenar personal y luego separar reportes por franja.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {turnos.map((turno, index) => (
            <div key={turno.id || index} className="rounded-2xl border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <input
                  value={turno.nombre || ''}
                  onChange={(e) => setTurnos((prev) => prev.map((item, idx) => idx === index ? { ...item, nombre: e.target.value } : item))}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <input
                    type="checkbox"
                    checked={turno.activo !== false}
                    onChange={(e) => setTurnos((prev) => prev.map((item, idx) => idx === index ? { ...item, activo: e.target.checked } : item))}
                    className="h-4 w-4 accent-orange-500"
                  />
                  Activo
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Desde</label>
                  <input
                    type="time"
                    value={turno.desde || '11:00'}
                    onChange={(e) => setTurnos((prev) => prev.map((item, idx) => idx === index ? { ...item, desde: e.target.value } : item))}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Hasta</label>
                  <input
                    type="time"
                    value={turno.hasta || '14:00'}
                    onChange={(e) => setTurnos((prev) => prev.map((item, idx) => idx === index ? { ...item, hasta: e.target.value } : item))}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        {config.turno_actual ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Abierto ahora en: <strong>{config.turno_actual.nombre}</strong>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Ahora mismo el negocio figura fuera de turno.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Backups y reset</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Backup automatico</label>
            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={config.backup_automatico_activo === '1'}
                onChange={(e) => setToggle('backup_automatico_activo', e.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              Activado
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Intervalo (horas)</label>
            <input type="number" min="1" {...f('backup_intervalo_horas')} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Maximo de archivos</label>
            <input type="number" min="3" {...f('backup_max_archivos')} />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Backup manual</p>
              <p className="mt-1 text-xs text-gray-500">Crea una copia de la base antes de tocar produccion o hacer cambios grandes.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={cargarBackups} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Recargar
              </button>
              <button onClick={crearBackup} disabled={creatingBackup} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {creatingBackup ? 'Creando...' : 'Crear backup'}
              </button>
            </div>
          </div>
          {backups.length > 0 ? (
            <div className="mt-4 space-y-2">
              {backups.slice(0, 8).map((backup) => (
                <div key={backup.file} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{backup.file}</p>
                    <p className="text-xs text-gray-500">{backup.created_at} - {Math.round((backup.size || 0) / 1024)} KB</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => descargarBackup(backup.file)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      <Download size={14} />
                      Descargar
                    </button>
                    <button
                      onClick={() => restaurarBackup(backup.file)}
                      disabled={restoringBackup === backup.file}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {restoringBackup === backup.file ? 'Restaurando...' : 'Restaurar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <RefreshCcw size={18} className="mt-0.5 text-rose-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-800">Reset de datos operativos</p>
              <p className="mt-1 text-xs text-rose-700">
                Borra pedidos, caja, auditoria, conversaciones, eventos de pago e impresiones. Conserva configuracion, menu, usuarios, personal, clientes y repartidores.
              </p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder="Escribi RESET para confirmar"
                  className="flex-1 rounded-xl border border-rose-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
                <button
                  onClick={ejecutarReset}
                  disabled={resettingData}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {resettingData ? 'Reseteando...' : 'Resetear operacion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Horarios de atencion</h2>
        <div className="space-y-3">
          {DIAS.map((dia, i) => {
            const h = horarios[dia] || { abierto: false, desde: '18:00', hasta: '23:00' };
            return (
              <div key={dia} className="flex items-center gap-4">
                <label className="flex w-28 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={h.abierto}
                    onChange={(e) => setHorarios((p) => ({ ...p, [dia]: { ...h, abierto: e.target.checked } }))}
                    className="h-4 w-4 accent-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{DIAS_LABELS[i]}</span>
                </label>
                {h.abierto ? (
                  <>
                    <input
                      type="time"
                      value={h.desde}
                      onChange={(e) => setHorarios((p) => ({ ...p, [dia]: { ...h, desde: e.target.value } }))}
                      className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-400">a</span>
                    <input
                      type="time"
                      value={h.hasta}
                      onChange={(e) => setHorarios((p) => ({ ...p, [dia]: { ...h, hasta: e.target.value } }))}
                      className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </>
                ) : (
                  <span className="text-sm text-gray-400">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
