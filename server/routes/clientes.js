const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { computeRewardState, recalculateClienteStats, recalculateAllClientes } = require('../utils/loyalty');
const { requirePermission } = require('../utils/permissions');
const { getConfigMap } = require('../utils/mercadoPago');
const { getWhatsAppStatus, normalizeWhatsAppPhone, sendWhatsAppText, logWhatsappDelivery } = require('../utils/whatsapp');

function tagsToString(tags) {
  if (!tags) return '[]';
  return typeof tags === 'string' ? tags : JSON.stringify(tags);
}

function normalizeCliente(row) {
  if (!row) return row;

  let tags = [];
  try {
    const parsed = JSON.parse(row.tags || '[]');
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }

  return {
    ...row,
    tags,
    puntos: Number(row.puntos || 0),
    sellos: Number(row.sellos || 0),
    canjes_premio: Number(row.canjes_premio || 0),
    frecuencia_dias: Number(row.frecuencia_dias || 7),
    total_gastado: Number(row.total_gastado || 0),
    total_pedidos: Number(row.total_pedidos || 0),
    recompensas_pendientes: computeRewardState(row.total_pedidos || 0, row.canjes_premio || 0).recompensasPendientes,
    ultima_compra: row.ultima_compra || '',
    nivel: row.nivel || 'Bronce',
    fecha_nacimiento: row.fecha_nacimiento || '',
  };
}

function buildCampaignMessage(template, payload) {
  return String(template || '').replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const clean = String(key || '').trim();
    return payload[clean] ?? '';
  }).replace(/\s{2,}/g, ' ').trim();
}

function getRecompraCandidates() {
  recalculateAllClientes(db);
  const config = getConfigMap(db);
  const dias = Math.max(1, Number(config.crm_dias_inactividad || 15));
  const rows = db.prepare(`
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE COALESCE(c.telefono, '') != ''
    GROUP BY c.id
    HAVING MAX(p.creado_en) IS NOT NULL
    ORDER BY datetime(MAX(p.creado_en)) ASC
  `).all();

  return rows
    .map(normalizeCliente)
    .map((cliente) => ({
      ...cliente,
      dias_inactivo: cliente.ultima_compra
        ? Math.max(0, Math.floor((Date.now() - new Date(cliente.ultima_compra).getTime()) / 86400000))
        : 999,
    }))
    .filter((cliente) => cliente.dias_inactivo >= dias);
}

function getBirthdayCandidates() {
  return db.prepare(`
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE COALESCE(c.telefono, '') != ''
      AND c.fecha_nacimiento != ''
      AND strftime('%m', c.fecha_nacimiento) = strftime('%m', 'now')
    GROUP BY c.id
    ORDER BY strftime('%d', c.fecha_nacimiento) ASC, c.total_gastado DESC
  `).all().map(normalizeCliente);
}

function classifyCliente(cliente) {
  const ultimaCompra = cliente.ultima_compra ? new Date(cliente.ultima_compra).getTime() : 0;
  const diasInactivo = ultimaCompra ? Math.max(0, Math.floor((Date.now() - ultimaCompra) / 86400000)) : 999;

  let estado = 'activo';
  if (diasInactivo >= 60) estado = 'perdido';
  else if (diasInactivo >= 30) estado = 'riesgo';
  else if ((cliente.total_pedidos || 0) >= 10 || ['Oro', 'Platino'].includes(cliente.nivel)) estado = 'vip';

  return {
    ...cliente,
    dias_inactivo: diasInactivo,
    estado_segmento: estado,
  };
}

router.get('/', auth, (req, res) => {
  recalculateAllClientes(db);
  const { search } = req.query;
  let q = `
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    q += ' AND (c.nombre LIKE ? OR c.telefono LIKE ? OR c.direccion LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  q += ' GROUP BY c.id ORDER BY c.total_pedidos DESC, c.nombre ASC';
  const rows = db.prepare(q).all(...params);
  res.json(rows.map(normalizeCliente));
});

router.get('/campanas/recompra', auth, requirePermission('clientes.edit'), (req, res) => {
  const config = getConfigMap(db);
  const clientes = getRecompraCandidates();
  const template = config.crm_mensaje_recompra || '';
  const cupon = config.crm_cupon_recompra || config.postventa_cupon_recompra || '';
  const pedidoUrl = String(config.whatsapp_bot_link_pedidos || config.public_app_url || '').replace(/\/$/, '');

  res.json({
    dias_inactividad: Number(config.crm_dias_inactividad || 15),
    cupon,
    total: clientes.length,
    clientes: clientes.map((cliente) => ({
      ...cliente,
      telefono_normalizado: normalizeWhatsAppPhone(cliente.telefono),
      mensaje_preview: buildCampaignMessage(template, {
        cliente: cliente.nombre || 'cliente',
        negocio: config.negocio_nombre || 'Modo Sabor',
        cupon,
        pedido_url: pedidoUrl,
      }),
    })),
  });
});

router.get('/campanas/cumpleanos', auth, requirePermission('clientes.edit'), (req, res) => {
  const config = getConfigMap(db);
  const cupon = config.crm_cupon_recompra || config.postventa_cupon_recompra || '';
  const clientes = getBirthdayCandidates();
  const template = `Hola {{cliente}}. En ${config.negocio_nombre || 'Modo Sabor'} te deseamos feliz cumple. Tenes disponible el cupon {{cupon}} para tu proximo pedido: {{pedido_url}}`;
  const pedidoUrl = String(config.whatsapp_bot_link_pedidos || config.public_app_url || '').replace(/\/$/, '');

  res.json({
    cupon,
    total: clientes.length,
    clientes: clientes.map((cliente) => ({
      ...cliente,
      telefono_normalizado: normalizeWhatsAppPhone(cliente.telefono),
      mensaje_preview: buildCampaignMessage(template, {
        cliente: cliente.nombre || 'cliente',
        cupon,
        pedido_url: pedidoUrl,
      }),
    })),
  });
});

router.get('/segmentos', auth, requirePermission('clientes.view'), (req, res) => {
  recalculateAllClientes(db);
  const rows = db.prepare(`
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    GROUP BY c.id
    ORDER BY c.total_gastado DESC, c.total_pedidos DESC
  `).all().map(normalizeCliente).map(classifyCliente);

  const summary = rows.reduce((acc, cliente) => {
    acc.total += 1;
    if (cliente.estado_segmento === 'vip') acc.vip += 1;
    if (cliente.estado_segmento === 'riesgo') acc.riesgo += 1;
    if (cliente.estado_segmento === 'perdido') acc.perdidos += 1;
    if (cliente.dias_inactivo >= 30) acc.inactivos += 1;
    if ((cliente.total_pedidos || 0) >= 5) acc.recurrentes += 1;
    if (cliente.cumpleEsteMes || (cliente.fecha_nacimiento && String(cliente.fecha_nacimiento).slice(5, 7) === new Date().toISOString().slice(5, 7))) acc.cumpleMes += 1;
    return acc;
  }, {
    total: 0,
    vip: 0,
    riesgo: 0,
    perdidos: 0,
    inactivos: 0,
    recurrentes: 0,
    cumpleMes: 0,
  });

  const favoritos = db.prepare(`
    SELECT
      TRIM(json_extract(value, '$.nombre')) AS nombre,
      COUNT(*) AS veces
    FROM pedidos, json_each(pedidos.items)
    WHERE pedidos.estado = 'entregado'
    GROUP BY TRIM(json_extract(value, '$.nombre'))
    HAVING nombre IS NOT NULL AND nombre != ''
    ORDER BY veces DESC, nombre ASC
    LIMIT 8
  `).all();

  res.json({
    summary,
    top_vip: rows.filter((cliente) => cliente.estado_segmento === 'vip').slice(0, 6),
    riesgo: rows.filter((cliente) => cliente.estado_segmento === 'riesgo').slice(0, 6),
    perdidos: rows.filter((cliente) => cliente.estado_segmento === 'perdido').slice(0, 6),
    favoritos,
  });
});

router.post('/campanas/recompra/enviar', auth, requirePermission('clientes.edit'), async (req, res) => {
  const config = getConfigMap(db);
  const status = getWhatsAppStatus(config);
  const clienteIds = Array.isArray(req.body?.cliente_ids) ? req.body.cliente_ids.map((id) => Number(id)) : [];
  if (clienteIds.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos un cliente para la campaña' });
  }

  const allCandidates = getRecompraCandidates();
  const selected = allCandidates.filter((cliente) => clienteIds.includes(Number(cliente.id)));
  const cupon = req.body?.cupon || config.crm_cupon_recompra || config.postventa_cupon_recompra || '';
  const template = req.body?.mensaje || config.crm_mensaje_recompra || '';
  const pedidoUrl = String(config.whatsapp_bot_link_pedidos || config.public_app_url || '').replace(/\/$/, '');

  const results = [];
  for (const cliente of selected) {
    const telefono = normalizeWhatsAppPhone(cliente.telefono);
    if (!telefono) {
      results.push({ id: cliente.id, ok: false, error: 'Telefono invalido' });
      continue;
    }

    const mensaje = buildCampaignMessage(template, {
      cliente: cliente.nombre || 'cliente',
      negocio: config.negocio_nombre || 'Modo Sabor',
      cupon,
      pedido_url: pedidoUrl,
    });

    if (status.mode === 'api' && status.ready) {
      try {
        const response = await sendWhatsAppText({ config, to: telefono, body: mensaje });
        logWhatsappDelivery(db, {
          pedidoId: null,
          tipo: 'crm_recompra',
          telefono,
          mensaje,
          proveedor: config.whatsapp_api_provider || 'meta',
          estado: 'enviado',
          externoId: response?.messages?.[0]?.id || '',
          payload: response,
        });
        results.push({ id: cliente.id, ok: true, mode: 'api' });
      } catch (error) {
        logWhatsappDelivery(db, {
          pedidoId: null,
          tipo: 'crm_recompra',
          telefono,
          mensaje,
          proveedor: config.whatsapp_api_provider || 'meta',
          estado: 'error',
          error: error.message || 'Error enviando campaña',
        });
        results.push({ id: cliente.id, ok: false, error: error.message || 'Error enviando campaña' });
      }
      continue;
    }

    results.push({
      id: cliente.id,
      ok: true,
      mode: 'manual',
      url: `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
    });
  }

  res.json({
    total: selected.length,
    enviados: results.filter((item) => item.ok).length,
    results,
  });
});

router.post('/campanas/cumpleanos/enviar', auth, requirePermission('clientes.edit'), async (req, res) => {
  const config = getConfigMap(db);
  const status = getWhatsAppStatus(config);
  const clienteIds = Array.isArray(req.body?.cliente_ids) ? req.body.cliente_ids.map((id) => Number(id)) : [];
  if (clienteIds.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos un cliente para la campaña' });
  }

  const allCandidates = getBirthdayCandidates();
  const selected = allCandidates.filter((cliente) => clienteIds.includes(Number(cliente.id)));
  const cupon = req.body?.cupon || config.crm_cupon_recompra || config.postventa_cupon_recompra || '';
  const pedidoUrl = String(config.whatsapp_bot_link_pedidos || config.public_app_url || '').replace(/\/$/, '');
  const template = req.body?.mensaje || `Hola {{cliente}}. En ${config.negocio_nombre || 'Modo Sabor'} te deseamos feliz cumple. Tenes disponible el cupon {{cupon}} para tu proximo pedido: {{pedido_url}}`;

  const results = [];
  for (const cliente of selected) {
    const telefono = normalizeWhatsAppPhone(cliente.telefono);
    if (!telefono) {
      results.push({ id: cliente.id, ok: false, error: 'Telefono invalido' });
      continue;
    }

    const mensaje = buildCampaignMessage(template, {
      cliente: cliente.nombre || 'cliente',
      negocio: config.negocio_nombre || 'Modo Sabor',
      cupon,
      pedido_url: pedidoUrl,
    });

    if (status.mode === 'api' && status.ready) {
      try {
        const response = await sendWhatsAppText({ config, to: telefono, body: mensaje });
        logWhatsappDelivery(db, {
          pedidoId: null,
          tipo: 'crm_cumpleanos',
          telefono,
          mensaje,
          proveedor: config.whatsapp_api_provider || 'meta',
          estado: 'enviado',
          externoId: response?.messages?.[0]?.id || '',
          payload: response,
        });
        results.push({ id: cliente.id, ok: true, mode: 'api' });
      } catch (error) {
        logWhatsappDelivery(db, {
          pedidoId: null,
          tipo: 'crm_cumpleanos',
          telefono,
          mensaje,
          proveedor: config.whatsapp_api_provider || 'meta',
          estado: 'error',
          error: error.message || 'Error enviando campaña',
        });
        results.push({ id: cliente.id, ok: false, error: error.message || 'Error enviando campaña' });
      }
      continue;
    }

    results.push({
      id: cliente.id,
      ok: true,
      mode: 'manual',
      url: `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
    });
  }

  res.json({
    total: selected.length,
    enviados: results.filter((item) => item.ok).length,
    results,
  });
});

router.get('/:id', auth, (req, res) => {
  recalculateClienteStats(db, req.params.id);
  const cliente = db
    .prepare(
      `
        SELECT
          c.*,
          COALESCE(MAX(p.creado_en), '') AS ultima_compra
        FROM clientes c
        LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
        WHERE c.id = ?
        GROUP BY c.id
      `
    )
    .get(req.params.id);

  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY creado_en DESC LIMIT 20').all(req.params.id);
  res.json({ ...normalizeCliente(cliente), pedidos });
});

router.post('/', auth, requirePermission('clientes.edit'), (req, res) => {
  const {
    nombre,
    telefono = '',
    email = '',
    direccion = '',
    notas = '',
    tags = '[]',
    fecha_nacimiento = '',
  } = req.body;

  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  const result = db
    .prepare(
      `
        INSERT INTO clientes (
          nombre, telefono, email, direccion, notas, tags,
          fecha_nacimiento
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      nombre,
      telefono,
      email,
      direccion,
      notas,
      tagsToString(tags),
      fecha_nacimiento || ''
    );

  const created = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
  res.json(normalizeCliente(created));
});

router.put('/:id', auth, requirePermission('clientes.edit'), (req, res) => {
  const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

  const payload = {
    nombre: req.body.nombre ?? existing.nombre,
    telefono: req.body.telefono ?? existing.telefono,
    email: req.body.email ?? existing.email,
    direccion: req.body.direccion ?? existing.direccion,
    notas: req.body.notas ?? existing.notas,
    tags: tagsToString(req.body.tags ?? existing.tags),
    fecha_nacimiento: req.body.fecha_nacimiento ?? existing.fecha_nacimiento ?? '',
  };

  db.prepare(
    `
      UPDATE clientes
      SET nombre = ?, telefono = ?, email = ?, direccion = ?, notas = ?, tags = ?,
          fecha_nacimiento = ?
      WHERE id = ?
    `
  ).run(
    payload.nombre,
    payload.telefono,
    payload.email,
    payload.direccion,
    payload.notas,
    payload.tags,
    payload.fecha_nacimiento,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json(normalizeCliente(updated));
});

router.post('/:id/canjear-regalo', auth, requirePermission('clientes.edit'), (req, res) => {
  const cliente = recalculateClienteStats(db, req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const rewardState = computeRewardState(cliente.total_pedidos || 0, cliente.canjes_premio || 0);
  if (rewardState.recompensasPendientes < 1) {
    return res.status(400).json({ error: 'No hay regalos pendientes para canjear' });
  }

  db.prepare('UPDATE clientes SET canjes_premio = canjes_premio + 1 WHERE id = ?').run(req.params.id);
  const updated = recalculateClienteStats(db, req.params.id);
  res.json(normalizeCliente(updated));
});

router.delete('/:id', auth, requirePermission('clientes.edit'), (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
