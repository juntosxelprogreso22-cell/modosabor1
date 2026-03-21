const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { recalculateClienteStats } = require('../utils/loyalty');
const { buildPrintDocument, buildMesaPrecuentaDocument } = require('../utils/printTemplates');
const { getConfigMap, createPreference, getPayment, searchPayments } = require('../utils/mercadoPago');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { requirePermission, hasPermission } = require('../utils/permissions');
const { quoteDelivery } = require('../utils/deliveryZones');
const { autoAssignPedido } = require('../utils/deliveryAssignment');
const { estimateDeliveryEta } = require('../utils/deliveryEta');
const { getShiftForDate } = require('../utils/shifts');
const {
  normalizeWhatsAppPhone,
  getWhatsAppStatus,
  sendWhatsAppText,
  logWhatsappDelivery,
} = require('../utils/whatsapp');

const ESTADO_LABELS = {
  nuevo: 'recibido',
  confirmado: 'confirmado',
  preparando: 'preparando',
  listo: 'listo',
  en_camino: 'en camino',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

const DEFAULT_NOTIFICATION_TEMPLATES = {
  nuevo: 'Hola {{cliente}}. Recibimos tu pedido #{{numero}} en {{negocio}}. Total: {{total}}. Seguilo aca: {{seguimiento_url}}',
  confirmado: 'Hola {{cliente}}. Tu pedido #{{numero}} ya fue confirmado en {{negocio}}. Tiempo estimado: {{tiempo_estimado}}. Seguilo aca: {{seguimiento_url}}',
  preparando: 'Hola {{cliente}}. Ya estamos preparando tu pedido #{{numero}}. Te avisamos cuando salga. Seguimiento: {{seguimiento_url}}',
  listo: 'Hola {{cliente}}. Tu pedido #{{numero}} ya esta listo. Si es delivery, sale en breve. Seguimiento: {{seguimiento_url}}',
  en_camino: 'Hola {{cliente}}. Tu pedido #{{numero}} ya va en camino. Repartidor: {{repartidor}}. Seguimiento: {{seguimiento_url}}',
  entregado: 'Hola {{cliente}}. Tu pedido #{{numero}} fue entregado. Gracias por elegir {{negocio}}. Si queres, dejanos tu resena aca: {{resena_url}}. Tu proxima compra puede usar {{cupon}}.',
  cancelado: 'Hola {{cliente}}. Tu pedido #{{numero}} fue cancelado. Si necesitas ayuda, escribinos por este medio.',
};

function getNextNumero() {
  const config = db.prepare("SELECT valor FROM configuracion WHERE clave = 'numero_pedido_actual'").get();
  const num = parseInt(config?.valor || '1', 10);
  db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('numero_pedido_actual', ?)").run(String(num + 1));
  return num;
}

function getPedidoOr404(id, res) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!pedido) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return null;
  }
  return pedido;
}

function getMesaPedidosAbiertos(mesa) {
  const mesaNormalizada = String(mesa || '').trim();
  return db.prepare(`
    SELECT *
    FROM pedidos
    WHERE tipo_entrega = 'mesa'
      AND TRIM(COALESCE(mesa, '')) = ?
      AND estado NOT IN ('entregado', 'cancelado')
    ORDER BY datetime(creado_en) ASC, id ASC
  `).all(mesaNormalizada);
}

function hydratePedido(pedido) {
  if (!pedido) return null;
  const config = getConfigMap(db);
  let repartidor = null;
  if (pedido.repartidor_id) {
    repartidor = db.prepare(
      'SELECT id, nombre, telefono, vehiculo, latitud, longitud, ultima_ubicacion_en, zona_preferida FROM repartidores WHERE id = ?'
    ).get(pedido.repartidor_id);
  }

  const eta = estimateDeliveryEta({ ...pedido, repartidor }, config);

  return {
    ...pedido,
    repartidor: repartidor || null,
    eta_min_dinamico: eta.minutes,
    eta_origen: eta.source,
    distancia_repartidor_km: eta.distance_km,
    ubicacion_repartidor_atrasada: eta.stale_location,
  };
}

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function parsePedidoItems(items) {
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items || '[]');
  } catch {
    return [];
  }
}

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function optionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function generateEntregaPin() {
  return String(Math.floor(1000 + (Math.random() * 9000)));
}

function subtotalFromItems(items) {
  return roundAmount(
    items.reduce((acc, item) => acc + (Number(item.precio_unitario || 0) * Number(item.cantidad || 0)), 0)
  );
}

function estimateText(pedido, config) {
  if (pedido.tipo_entrega === 'delivery') {
    return `${Number(pedido.eta_min_dinamico || pedido.tiempo_estimado_min || config.tiempo_delivery || 30)} min`;
  }
  if (pedido.tipo_entrega === 'retiro') {
    return `${Number(config.tiempo_retiro || 20)} min`;
  }
  return 'a confirmar';
}

function buildTrackingUrl(baseUrl, pedidoId) {
  const cleanedBase = String(baseUrl || '').replace(/\/$/, '');
  return cleanedBase ? `${cleanedBase}/seguimiento/${pedidoId}` : `/seguimiento/${pedidoId}`;
}

function applyTemplate(template, payload) {
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const cleanKey = String(key || '').trim();
    return payload[cleanKey] ?? '';
  }).replace(/\s{2,}/g, ' ').trim();
}

function buildWhatsappNotification(pedido, tipo, baseUrl) {
  const config = getConfigMap(db);
  const hydrated = hydratePedido(pedido);
  const notificationType = DEFAULT_NOTIFICATION_TEMPLATES[tipo] ? tipo : (hydrated.estado || 'confirmado');
  const template = config[`whatsapp_mensaje_${notificationType}`] || DEFAULT_NOTIFICATION_TEMPLATES[notificationType];
  const telefono = normalizeWhatsAppPhone(hydrated.cliente_telefono);
  const seguimientoUrl = buildTrackingUrl(baseUrl, hydrated.id);
  const payload = {
    cliente: hydrated.cliente_nombre || 'cliente',
    negocio: config.negocio_nombre || 'Modo Sabor',
    numero: hydrated.numero,
    total: money(hydrated.total),
    estado: ESTADO_LABELS[hydrated.estado] || hydrated.estado,
    seguimiento_url: seguimientoUrl,
    tiempo_estimado: estimateText(hydrated, config),
    zona_delivery: hydrated.delivery_zona || '',
    repartidor: hydrated.repartidor?.nombre || hydrated.repartidor_nombre || 'por asignar',
    telefono_local: config.negocio_telefono || '',
    direccion: hydrated.cliente_direccion || '',
    entrega: hydrated.tipo_entrega || '',
    cupon: config.postventa_cupon_recompra || '',
    resena_url: config.postventa_url_resena || '',
  };
  const mensaje = applyTemplate(template, payload);

  return {
    tipo: notificationType,
    telefono,
    mensaje,
    url: telefono ? `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}` : '',
  };
}

async function deliverWhatsAppNotification(pedido, tipo, baseUrl, options = {}) {
  const config = getConfigMap(db);
  const notification = buildWhatsappNotification(pedido, tipo, baseUrl || config.public_app_url || '');
  const provider = config.whatsapp_modo_envio === 'api'
    ? (config.whatsapp_api_provider || 'meta')
    : 'manual';

  if (!notification.telefono) {
    throw new Error('El pedido no tiene telefono para WhatsApp');
  }

  try {
    const result = await sendWhatsAppText({
      config,
      to: notification.telefono,
      body: notification.mensaje,
    });
    logWhatsappDelivery(db, {
      pedidoId: pedido.id,
      tipo: notification.tipo,
      telefono: notification.telefono,
      mensaje: notification.mensaje,
      proveedor: provider,
      estado: 'enviado',
      externoId: result?.messages?.[0]?.id || result?.message_id || '',
      payload: result,
    });
    return {
      ...notification,
      mode: 'api',
      sent: true,
      result,
    };
  } catch (error) {
    logWhatsappDelivery(db, {
      pedidoId: pedido.id,
      tipo: notification.tipo,
      telefono: notification.telefono,
      mensaje: notification.mensaje,
      proveedor: provider,
      estado: 'error',
      error: error.message || 'Error enviando WhatsApp',
      payload: {
        forced: Boolean(options.force),
      },
    });
    throw error;
  }
}

async function autoSendNotificationIfEnabled(pedido, tipo, baseUrl) {
  const config = getConfigMap(db);
  const status = getWhatsAppStatus(config);

  if (config.whatsapp_notificaciones_auto !== '1') return null;
  if (status.mode !== 'api' || !status.ready) return null;
  if (!pedido?.cliente_telefono) return null;

  return deliverWhatsAppNotification(pedido, tipo, baseUrl, { force: false });
}

function registerPrintJob(pedidoId, tipo, area, copias, payload, printed = false) {
  const result = db.prepare(
    `
      INSERT INTO impresiones (pedido_id, tipo, area, estado, copias, intentos, payload, impreso_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    pedidoId,
    tipo,
    area,
    printed ? 'impreso' : 'pendiente',
    Math.max(1, Number(copias || 1)),
    printed ? 1 : 0,
    JSON.stringify(payload),
    printed ? new Date().toISOString() : null
  );

  return db.prepare('SELECT * FROM impresiones WHERE id = ?').get(result.lastInsertRowid);
}

function configuredCopies(tipo) {
  const clave = tipo === 'comanda_cocina' ? 'impresion_copias_comanda' : 'impresion_copias_ticket';
  const value = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return Math.max(1, Number(value?.valor || 1));
}

function canNotifyPedido(user) {
  return hasPermission(user, 'pedidos.edit') || hasPermission(user, 'delivery.manage');
}

function canTransitionPedido(user, pedido, nextEstado) {
  if (hasPermission(user, 'pedidos.edit')) return true;

  if (hasPermission(user, 'pedidos.kitchen')) {
    if (pedido.estado === 'confirmado' && nextEstado === 'preparando') return true;
    if (pedido.estado === 'preparando' && nextEstado === 'listo') return true;
    if (pedido.estado === 'listo' && pedido.tipo_entrega === 'delivery' && nextEstado === 'en_camino') return true;
    if (pedido.estado === 'listo' && pedido.tipo_entrega !== 'delivery' && nextEstado === 'entregado') return true;
    return false;
  }

  if (hasPermission(user, 'delivery.manage')) {
    return pedido.tipo_entrega === 'delivery' && pedido.estado === 'en_camino' && nextEstado === 'entregado';
  }

  return false;
}

function createPedidoRecord(payload) {
  const {
    cliente_nombre = '',
    cliente_telefono = '',
    cliente_direccion = '',
    items,
    subtotal,
    costo_envio = 0,
    descuento = 0,
    total,
    tipo_entrega = 'delivery',
    mesa = '',
    metodo_pago = 'efectivo',
    notas = '',
    origen = 'web',
    pago_estado = 'pendiente',
    pago_id = '',
    mp_preference_id = '',
    pago_detalle = '',
    delivery_zona = '',
    tiempo_estimado_min = 0,
    turno_operativo = '',
    entrega_pin = '',
    cliente_latitud = null,
    cliente_longitud = null,
    entrega_foto = '',
    entrega_foto_en = null,
  } = payload;

  const numero = getNextNumero();
  let cliente_id = null;

  if (cliente_telefono) {
    const existing = db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(cliente_telefono);
    if (existing) {
      cliente_id = existing.id;
      db.prepare('UPDATE clientes SET nombre = ?, direccion = ? WHERE id = ?').run(cliente_nombre || '', cliente_direccion || '', existing.id);
    } else if (cliente_nombre) {
      const created = db.prepare('INSERT INTO clientes (nombre, telefono, direccion) VALUES (?, ?, ?)').run(cliente_nombre, cliente_telefono, cliente_direccion || '');
      cliente_id = created.lastInsertRowid;
    }
  }

  const itemsStr = typeof items === 'string' ? items : JSON.stringify(items);
  const result = db
    .prepare(
      `INSERT INTO pedidos (
        numero, cliente_id, cliente_nombre, cliente_telefono, cliente_direccion, items,
        subtotal, costo_envio, descuento, total, tipo_entrega, mesa, metodo_pago,
        notas, origen, pago_estado, pago_id, mp_preference_id, pago_detalle, delivery_zona, tiempo_estimado_min,
        turno_operativo, entrega_pin, cliente_latitud, cliente_longitud, entrega_foto, entrega_foto_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      numero,
      cliente_id,
      cliente_nombre,
      cliente_telefono,
      cliente_direccion,
      itemsStr,
      subtotal,
      costo_envio,
      descuento,
      total,
      tipo_entrega,
      mesa,
      metodo_pago,
      notas,
      origen,
      pago_estado,
      pago_id,
      mp_preference_id,
      pago_detalle,
      delivery_zona,
      Number(tiempo_estimado_min || 0),
      turno_operativo || '',
      entrega_pin || '',
      optionalNumber(cliente_latitud),
      optionalNumber(cliente_longitud),
      entrega_foto || '',
      entrega_foto_en || null
    );

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(result.lastInsertRowid);
}

function buildPedidoPayload(body, options = {}) {
  const config = options.config || getConfigMap(db);
  const tipoEntrega = body.tipo_entrega || 'delivery';
  const shift = getShiftForDate(config, new Date());
  const origen = body.origen || 'web';
  const isPublicFlow = ['web', 'whatsapp'].includes(origen);
  const parsedItems = typeof body.items === 'string'
    ? JSON.parse(body.items)
    : (Array.isArray(body.items) ? body.items : []);
  const subtotal = subtotalFromItems(parsedItems);
  const descuento = roundAmount(body.descuento || 0);

  let costoEnvio = 0;
  let deliveryZona = '';
  let tiempoEstimadoMin = 0;

  if (isPublicFlow && !shift) {
    throw new Error('Ahora mismo estamos fuera de turno. Podes dejar el pedido para el siguiente horario o pedir por el local.');
  }

  if (tipoEntrega === 'delivery') {
    if (!String(body.cliente_direccion || '').trim()) {
      throw new Error('Falta la direccion para delivery');
    }
    const quote = quoteDelivery(config, body.cliente_direccion || '');
    if (!quote.available) {
      throw new Error(quote.message || 'La direccion no pertenece a una zona de delivery valida');
    }
    costoEnvio = roundAmount(quote.costo_envio || 0);
    deliveryZona = quote.zone_name || '';
    tiempoEstimadoMin = Number(quote.tiempo_estimado_min || config.tiempo_delivery || 30);
  } else if (tipoEntrega === 'retiro') {
    tiempoEstimadoMin = Number(config.tiempo_retiro || 20);
  }

  return {
    cliente_nombre: body.cliente_nombre || '',
    cliente_telefono: body.cliente_telefono || '',
    cliente_direccion: body.cliente_direccion || '',
    items: parsedItems,
    subtotal,
    costo_envio: costoEnvio,
    descuento,
    total: roundAmount(subtotal + costoEnvio - descuento),
    tipo_entrega: tipoEntrega,
    mesa: body.mesa || '',
    metodo_pago: body.metodo_pago || 'efectivo',
    notas: body.notas || '',
    origen,
    delivery_zona: deliveryZona,
    tiempo_estimado_min: tiempoEstimadoMin,
    turno_operativo: shift?.nombre || '',
    entrega_pin: tipoEntrega === 'delivery' ? generateEntregaPin() : '',
    cliente_latitud: optionalNumber(body.cliente_latitud),
    cliente_longitud: optionalNumber(body.cliente_longitud),
  };
}

function splitPedidoMesa(pedido, splitItems, mesaDestino) {
  const originalItems = parsePedidoItems(pedido.items);
  const selectedItems = [];
  const remainingItems = [];

  originalItems.forEach((item, index) => {
    const requestedQty = Math.max(0, Number(splitItems[index] || 0));
    const currentQty = Math.max(0, Number(item.cantidad || 0));

    if (requestedQty > currentQty) {
      throw new Error(`La cantidad para "${item.nombre}" supera lo cargado en el pedido`);
    }

    if (requestedQty > 0) {
      selectedItems.push({
        ...item,
        cantidad: requestedQty,
      });
    }

    if (currentQty - requestedQty > 0) {
      remainingItems.push({
        ...item,
        cantidad: currentQty - requestedQty,
      });
    }
  });

  if (selectedItems.length === 0) {
    throw new Error('Selecciona al menos un item para dividir');
  }

  if (remainingItems.length === 0) {
    throw new Error('No puedes dividir el pedido completo. Usa mover pedido si quieres pasarlo entero');
  }

  const originalSubtotal = subtotalFromItems(originalItems);
  const selectedSubtotal = subtotalFromItems(selectedItems);
  const remainingSubtotal = subtotalFromItems(remainingItems);
  const originalDiscount = roundAmount(pedido.descuento || 0);
  const selectedDiscount = originalSubtotal > 0
    ? roundAmount(originalDiscount * (selectedSubtotal / originalSubtotal))
    : 0;
  const remainingDiscount = roundAmount(originalDiscount - selectedDiscount);

  const nuevoPedido = createPedidoRecord({
    cliente_nombre: pedido.cliente_nombre,
    cliente_telefono: pedido.cliente_telefono,
    cliente_direccion: pedido.cliente_direccion,
    items: selectedItems,
    subtotal: selectedSubtotal,
    costo_envio: 0,
    descuento: selectedDiscount,
    total: roundAmount(selectedSubtotal - selectedDiscount),
    tipo_entrega: 'mesa',
    mesa: mesaDestino,
    metodo_pago: pedido.metodo_pago,
    notas: pedido.notas || '',
    origen: 'division_mesa',
    pago_estado: pedido.pago_estado || 'pendiente',
  });

  db.prepare(`
    UPDATE pedidos
    SET items = ?, subtotal = ?, descuento = ?, total = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    JSON.stringify(remainingItems),
    remainingSubtotal,
    remainingDiscount,
    roundAmount(remainingSubtotal - remainingDiscount),
    pedido.id
  );

  return {
    original: db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id),
    nuevo: nuevoPedido,
  };
}

function normalizeForKey(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function mergePedidoItems(items) {
  const merged = [];
  const indexMap = new Map();

  items.forEach((item) => {
    const key = [
      item.producto_id || '',
      item.nombre || '',
      Number(item.precio_unitario || 0),
      item.descripcion || '',
      normalizeForKey(item.variantes || {}),
      normalizeForKey(item.extras || []),
    ].join('|');

    if (indexMap.has(key)) {
      const targetIndex = indexMap.get(key);
      merged[targetIndex].cantidad += Number(item.cantidad || 0);
      return;
    }

    indexMap.set(key, merged.length);
    merged.push({
      ...item,
      cantidad: Number(item.cantidad || 0),
    });
  });

  return merged;
}

function mergeMesaPedidosIntoTarget(targetPedido, pedidosToMerge, mesaDestino) {
  const allPedidos = [targetPedido, ...pedidosToMerge];
  const allItems = allPedidos.flatMap((pedido) => parsePedidoItems(pedido.items));
  const mergedItems = mergePedidoItems(allItems);
  const subtotal = roundAmount(allPedidos.reduce((acc, pedido) => acc + Number(pedido.subtotal || 0), 0));
  const descuento = roundAmount(allPedidos.reduce((acc, pedido) => acc + Number(pedido.descuento || 0), 0));
  const total = roundAmount(allPedidos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0));
  const notas = allPedidos
    .map((pedido) => String(pedido.notas || '').trim())
    .filter(Boolean)
    .filter((note, index, array) => array.indexOf(note) === index)
    .join(' | ');

  db.prepare(`
    UPDATE pedidos
    SET mesa = ?, items = ?, subtotal = ?, descuento = ?, total = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(mesaDestino, JSON.stringify(mergedItems), subtotal, descuento, total, notas, targetPedido.id);

  const idsToDelete = pedidosToMerge.map((pedido) => pedido.id);
  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM pedidos WHERE id IN (${placeholders})`).run(...idsToDelete);
  }

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(targetPedido.id);
}

function syncPaymentIntoPedido(pedido, payment) {
  if (!pedido || !payment) return null;

  const status = payment.status || 'pending';
  const detail = payment.status_detail || '';
  const shouldConfirm = status === 'approved' && pedido.estado === 'nuevo';

  db.prepare(
    `
      UPDATE pedidos
      SET pago_estado = ?, pago_id = ?, pago_detalle = ?, estado = CASE WHEN ? THEN 'confirmado' ELSE estado END,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).run(status, String(payment.id || ''), detail, shouldConfirm ? 1 : 0, pedido.id);

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
}

function logMercadoPagoEvent({ pedidoId = null, tipo = '', paymentId = '', estado = '', detalle = '', payload = {} }) {
  db.prepare(`
    INSERT INTO mercadopago_eventos (pedido_id, tipo, payment_id, estado, detalle, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    pedidoId,
    tipo,
    String(paymentId || ''),
    String(estado || ''),
    String(detalle || ''),
    JSON.stringify(payload || {})
  );
}

async function syncPedidoMercadoPago(db, pedido, config) {
  if (!config.mercadopago_token) {
    throw new Error('Falta configurar MercadoPago en el sistema');
  }

  let payment = null;
  let source = '';
  const paymentId = pedido.pago_id || '';

  if (paymentId) {
    payment = await getPayment({ token: config.mercadopago_token, paymentId });
    source = 'payment_id';
  } else {
    const search = await searchPayments({
      token: config.mercadopago_token,
      externalReference: pedido.id,
      limit: 1,
    });
    payment = search?.results?.[0] || null;
    source = 'external_reference';
  }

  if (!payment) {
    return {
      ok: false,
      source,
      pedido: hydratePedido(pedido),
      message: 'No se encontro un pago en MercadoPago para este pedido',
    };
  }

  const synced = syncPaymentIntoPedido(pedido, payment);
  return {
    ok: true,
    source,
    payment,
    pedido: hydratePedido(synced),
    message: 'Pago sincronizado correctamente',
  };
}

router.get('/', auth, requirePermission('pedidos.view'), (req, res) => {
  const { estado, fecha_desde, fecha_hasta, limit = 200 } = req.query;
  let q = 'SELECT * FROM pedidos WHERE 1=1';
  const params = [];
  if (estado) { q += ' AND estado = ?'; params.push(estado); }
  if (fecha_desde) { q += ' AND DATE(creado_en) >= ?'; params.push(fecha_desde); }
  if (fecha_hasta) { q += ' AND DATE(creado_en) <= ?'; params.push(fecha_hasta); }
  q += ' ORDER BY creado_en DESC LIMIT ?';
  params.push(Number(limit));
  res.json(db.prepare(q).all(...params));
});

router.get('/activos', auth, requirePermission('pedidos.view'), (req, res) => {
  res.json(db.prepare("SELECT * FROM pedidos WHERE estado NOT IN ('entregado','cancelado') ORDER BY creado_en ASC").all());
});

router.post('/mesa/:mesa/precuenta', auth, requirePermission('pedidos.print'), (req, res) => {
  const mesa = String(req.params.mesa || '').trim();
  if (!mesa) return res.status(400).json({ error: 'Mesa invalida' });

  const pedidosMesa = getMesaPedidosAbiertos(mesa);
  if (pedidosMesa.length === 0) {
    return res.status(404).json({ error: 'No hay pedidos abiertos para esa mesa' });
  }

  const document = buildMesaPrecuentaDocument(db, mesa, pedidosMesa);
  const copias = Math.max(1, Number(req.body?.copias || configuredCopies('ticket_cliente')));
  const impresion = registerPrintJob(pedidosMesa[0].id, document.tipo, document.area, copias, document.payload, true);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'impresiones',
    accion: 'precuenta_mesa',
    entidad: 'mesa',
    entidad_id: mesa,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      mesa,
      pedidos: pedidosMesa.map((pedido) => pedido.id),
      copias,
      impresion_id: impresion.id,
    },
  });

  res.json({
    mesa,
    pedidos: pedidosMesa.map((pedido) => hydratePedido(pedido)),
    total: pedidosMesa.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0),
    impresion,
    html: document.html,
  });
});

router.put('/mesa/:mesa/mover', auth, requirePermission('pedidos.edit'), (req, res) => {
  const origen = String(req.params.mesa || '').trim();
  const destino = String(req.body?.mesa_destino || '').trim();

  if (!origen || !destino) {
    return res.status(400).json({ error: 'Mesa origen y destino son requeridas' });
  }

  if (origen === destino) {
    return res.status(400).json({ error: 'La mesa destino debe ser distinta' });
  }

  const pedidosMesa = getMesaPedidosAbiertos(origen);
  if (pedidosMesa.length === 0) {
    return res.status(404).json({ error: 'No hay pedidos abiertos para esa mesa' });
  }

  db.prepare(`
    UPDATE pedidos
    SET mesa = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE tipo_entrega = 'mesa'
      AND TRIM(COALESCE(mesa, '')) = ?
      AND estado NOT IN ('entregado', 'cancelado')
  `).run(destino, origen);

  const actualizados = getMesaPedidosAbiertos(destino);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'mover_mesa',
    entidad: 'mesa',
    entidad_id: origen,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      origen,
      destino,
      pedidos: pedidosMesa.map((pedido) => pedido.id),
    },
  });

  const io = req.app.get('io');
  if (io) {
    actualizados.forEach((pedido) => io.emit('pedido_actualizado', hydratePedido(pedido)));
  }

  res.json({
    ok: true,
    origen,
    destino,
    pedidos: actualizados.map((pedido) => hydratePedido(pedido)),
  });
});

router.post('/mesa/:mesa/fusionar', auth, requirePermission('pedidos.edit'), (req, res) => {
  const origen = String(req.params.mesa || '').trim();
  const destino = String(req.body?.mesa_destino || '').trim();

  if (!origen || !destino) {
    return res.status(400).json({ error: 'Mesa origen y destino son requeridas' });
  }

  if (origen === destino) {
    return res.status(400).json({ error: 'La mesa destino debe ser distinta' });
  }

  const origenPedidos = getMesaPedidosAbiertos(origen);
  if (origenPedidos.length === 0) {
    return res.status(404).json({ error: 'No hay pedidos abiertos en la mesa origen' });
  }

  const destinoPedidos = getMesaPedidosAbiertos(destino);
  const ordered = [...destinoPedidos, ...origenPedidos].sort(
    (a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime() || a.id - b.id
  );
  const targetPedido = ordered[0];
  const pedidosToMerge = ordered.slice(1);
  const merged = mergeMesaPedidosIntoTarget(targetPedido, pedidosToMerge, destino);

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'fusionar_mesa',
    entidad: 'mesa',
    entidad_id: origen,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      origen,
      destino,
      pedido_resultante: merged.id,
      pedidos_origen: origenPedidos.map((pedido) => pedido.id),
      pedidos_destino: destinoPedidos.map((pedido) => pedido.id),
    },
  });

  const io = req.app.get('io');
  const hydrated = hydratePedido(merged);
  if (io) io.emit('pedido_actualizado', hydrated);

  res.json({
    ok: true,
    origen,
    destino,
    pedido: hydrated,
  });
});

router.get('/mesas/reservas', auth, requirePermission('mesas.view'), (req, res) => {
  const estado = String(req.query.estado || '').trim();
  let query = `
    SELECT *
    FROM mesa_reservas
    WHERE 1 = 1
  `;
  const params = [];

  if (estado) {
    query += ' AND estado = ?';
    params.push(estado);
  } else {
    query += " AND estado IN ('reservada', 'confirmada')";
  }

  query += ' ORDER BY datetime(horario_reserva) ASC, id ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/mesas/reservas', auth, requirePermission('pedidos.edit'), (req, res) => {
  const mesa = String(req.body?.mesa || '').trim();
  const clienteNombre = String(req.body?.cliente_nombre || '').trim();
  const clienteTelefono = String(req.body?.cliente_telefono || '').trim();
  const cantidadPersonas = Math.max(1, Number(req.body?.cantidad_personas || 1));
  const horarioReserva = String(req.body?.horario_reserva || '').trim();
  const notas = String(req.body?.notas || '').trim();

  if (!mesa || !clienteNombre || !horarioReserva) {
    return res.status(400).json({ error: 'Mesa, cliente y horario son obligatorios' });
  }

  const result = db.prepare(`
    INSERT INTO mesa_reservas (mesa, cliente_nombre, cliente_telefono, cantidad_personas, horario_reserva, notas)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(mesa, clienteNombre, clienteTelefono, cantidadPersonas, horarioReserva, notas);

  const reserva = db.prepare('SELECT * FROM mesa_reservas WHERE id = ?').get(result.lastInsertRowid);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'crear_reserva',
    entidad: 'reserva',
    entidad_id: reserva.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      mesa,
      cliente_nombre: clienteNombre,
      horario_reserva: horarioReserva,
      cantidad_personas: cantidadPersonas,
    },
  });

  res.json(reserva);
});

router.put('/mesas/reservas/:id', auth, requirePermission('pedidos.edit'), (req, res) => {
  const reserva = db.prepare('SELECT * FROM mesa_reservas WHERE id = ?').get(req.params.id);
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

  const estado = String(req.body?.estado || reserva.estado).trim();
  const validStates = ['reservada', 'confirmada', 'atendida', 'cancelada'];
  if (!validStates.includes(estado)) {
    return res.status(400).json({ error: 'Estado de reserva invalido' });
  }

  db.prepare(`
    UPDATE mesa_reservas
    SET estado = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(estado, reserva.id);

  const updated = db.prepare('SELECT * FROM mesa_reservas WHERE id = ?').get(reserva.id);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'estado_reserva',
    entidad: 'reserva',
    entidad_id: updated.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      mesa: updated.mesa,
      desde: reserva.estado,
      hacia: estado,
    },
  });

  res.json(updated);
});

router.get('/:id', (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json(hydratePedido(pedido));
});

router.get('/:id/impresiones', auth, requirePermission('pedidos.print'), (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const impresiones = db
    .prepare('SELECT * FROM impresiones WHERE pedido_id = ? ORDER BY datetime(creado_en) DESC, id DESC')
    .all(req.params.id);

  res.json(impresiones);
});

router.get('/:id/impresion/:tipo', auth, requirePermission('pedidos.print'), (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const tipo = req.params.tipo === 'comanda' ? 'comanda_cocina' : 'ticket_cliente';
  const document = buildPrintDocument(db, pedido, tipo);

  res.type('html').send(document.html);
});

router.get('/:id/notificacion/:tipo', auth, (req, res) => {
  if (!canNotifyPedido(req.user)) {
    return res.status(403).json({ error: 'Sin permisos para notificar al cliente' });
  }

  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const notification = buildWhatsappNotification(pedido, req.params.tipo, req.query.base_url || '');
  if (!notification.telefono) {
    return res.status(400).json({ error: 'El pedido no tiene telefono para WhatsApp' });
  }

  res.json(notification);
});

router.get('/pagos/mercadopago/pendientes', auth, requirePermission('pedidos.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM pedidos
    WHERE metodo_pago = 'mercadopago'
      AND pago_estado IN ('pending', 'pendiente', 'in_process', 'authorized', '')
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 100
  `).all();
  res.json(rows.map((pedido) => hydratePedido(pedido)));
});

router.post('/pagos/mercadopago/sync-pendientes', auth, requirePermission('pedidos.edit'), async (req, res) => {
  const config = getConfigMap(db);
  const pendingOrders = db.prepare(`
    SELECT *
    FROM pedidos
    WHERE metodo_pago = 'mercadopago'
      AND pago_estado IN ('pending', 'pendiente', 'in_process', 'authorized', '')
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 30
  `).all();

  const results = [];
  for (const pedido of pendingOrders) {
    try {
      const synced = await syncPedidoMercadoPago(db, pedido, config);
      results.push({
        pedido_id: pedido.id,
        numero: pedido.numero,
        ok: synced.ok,
        pago_estado: synced.pedido?.pago_estado || pedido.pago_estado,
        estado: synced.pedido?.estado || pedido.estado,
        message: synced.message,
      });
      if (synced.ok) {
        const io = req.app.get('io');
        if (io) io.emit('pedido_actualizado', synced.pedido);
        if (pedido.estado !== synced.pedido.estado) {
          await autoSendNotificationIfEnabled(synced.pedido, synced.pedido.estado, config.public_app_url || '').catch(() => null);
        }
      }
    } catch (error) {
      results.push({
        pedido_id: pedido.id,
        numero: pedido.numero,
        ok: false,
        pago_estado: pedido.pago_estado,
        estado: pedido.estado,
        message: error.message || 'No se pudo sincronizar',
      });
    }
  }

  res.json({
    total: pendingOrders.length,
    synced: results.filter((item) => item.ok).length,
    results,
  });
});

router.post('/:id/notificacion/:tipo/enviar', auth, async (req, res) => {
  if (!canNotifyPedido(req.user)) {
    return res.status(403).json({ error: 'Sin permisos para notificar al cliente' });
  }

  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const config = getConfigMap(db);
  const status = getWhatsAppStatus(config);
  if (status.mode !== 'api' || !status.ready) {
    return res.status(400).json({ error: 'WhatsApp API no esta listo. Revisa configuracion.' });
  }

  try {
    const result = await deliverWhatsAppNotification(
      pedido,
      req.params.tipo,
      req.body?.base_url || config.public_app_url || ''
    );

    const actor = actorFromRequest(req);
    logAudit(db, {
      modulo: 'whatsapp',
      accion: 'enviar',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        numero: pedido.numero,
        tipo: result.tipo,
        telefono: result.telefono,
      },
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar el mensaje' });
  }
});

router.post('/:id/pago/mercadopago/sync', auth, requirePermission('pedidos.edit'), async (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  if (pedido.metodo_pago !== 'mercadopago') {
    return res.status(400).json({ error: 'Este pedido no usa MercadoPago' });
  }

  const config = getConfigMap(db);
  try {
    const synced = await syncPedidoMercadoPago(db, pedido, config);
    const actor = actorFromRequest(req);
    logAudit(db, {
      modulo: 'pagos',
      accion: 'sync_mercadopago',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        numero: pedido.numero,
        pago_estado: synced.pedido?.pago_estado || pedido.pago_estado,
        source: synced.source || '',
      },
    });

    if (synced.ok) {
      const io = req.app.get('io');
      if (io) io.emit('pedido_actualizado', synced.pedido);
      if (pedido.estado !== synced.pedido.estado) {
        await autoSendNotificationIfEnabled(synced.pedido, synced.pedido.estado, config.public_app_url || '').catch(() => null);
      }
    }

    return res.json(synced);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo sincronizar el pago' });
  }
});

router.post('/checkout/mercadopago', async (req, res) => {
  const config = getConfigMap(db);
  if (!config.mercadopago_token) {
    return res.status(400).json({ error: 'Falta configurar MercadoPago en el sistema' });
  }

  if (!req.body?.items) {
    return res.status(400).json({ error: 'Items y total requeridos' });
  }

  try {
    const normalized = buildPedidoPayload({
      ...req.body,
      metodo_pago: 'mercadopago',
    }, { config });
    const pedido = createPedidoRecord({
      ...normalized,
      pago_estado: 'pending',
    });

    const appUrl = String(config.public_app_url || req.headers.origin || 'http://localhost:5173').replace(/\/$/, '');
    const apiUrl = String(config.public_api_url || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const parsedItems = normalized.items;
    const mpItems = parsedItems.map((item) => ({
      id: String(item.producto_id || item.id || item.nombre),
      title: item.descripcion ? `${item.nombre} - ${item.descripcion}` : item.nombre,
      quantity: Number(item.cantidad || 1),
      currency_id: 'ARS',
      unit_price: Number(item.precio_unitario || 0),
    }));
    if (Number(normalized.costo_envio || 0) > 0) {
      mpItems.push({
        id: `envio-${pedido.id}`,
        title: normalized.delivery_zona ? `Envio ${normalized.delivery_zona}` : 'Envio',
        quantity: 1,
        currency_id: 'ARS',
        unit_price: Number(normalized.costo_envio || 0),
      });
    }
    const preference = await createPreference({
      token: config.mercadopago_token,
      idempotencyKey: `pedido-${pedido.id}-${Date.now()}`,
      body: {
        items: mpItems,
        payer: {
          name: normalized.cliente_nombre || undefined,
          phone: normalized.cliente_telefono ? { number: normalized.cliente_telefono } : undefined,
        },
        external_reference: String(pedido.id),
        statement_descriptor: (config.negocio_nombre || 'Modo Sabor').slice(0, 22),
        binary_mode: config.mercadopago_binary_mode === '1',
        metadata: {
          pedido_id: pedido.id,
          pedido_numero: pedido.numero,
          origen: normalized.origen,
          delivery_zona: normalized.delivery_zona || '',
          cliente_telefono: normalized.cliente_telefono || '',
        },
        back_urls: {
          success: `${appUrl}/?pedido_id=${pedido.id}&mp=success`,
          failure: `${appUrl}/?pedido_id=${pedido.id}&mp=failure`,
          pending: `${appUrl}/?pedido_id=${pedido.id}&mp=pending`,
        },
        auto_return: 'approved',
        notification_url: `${apiUrl}/api/pedidos/webhook/mercadopago`,
      },
    });

    logMercadoPagoEvent({
      pedidoId: pedido.id,
      tipo: 'preference_created',
      paymentId: '',
      estado: 'pending',
      detalle: preference.id || '',
      payload: {
        preference_id: preference.id,
        init_point: preference.init_point || '',
      },
    });

    db.prepare('UPDATE pedidos SET mp_preference_id = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(
      preference.id || '',
      pedido.id
    );

    const hydrated = hydratePedido(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id));
    const io = req.app.get('io');
    if (io) io.emit('nuevo_pedido', hydrated);
    await autoSendNotificationIfEnabled(hydrated, 'nuevo', config.public_app_url || '').catch(() => null);

    res.json({
      pedido: hydrated,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      preference_id: preference.id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo crear el checkout de MercadoPago' });
  }
});

router.get('/:id/pago/mercadopago', async (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const config = getConfigMap(db);
  if (!config.mercadopago_token) {
    return res.status(400).json({ error: 'Falta configurar MercadoPago en el sistema' });
  }

  const paymentId = req.query.payment_id || req.query.collection_id || pedido.pago_id;
  if (!paymentId) {
    return res.json(hydratePedido(pedido));
  }

  try {
    const payment = await getPayment({ token: config.mercadopago_token, paymentId });
    const synced = syncPaymentIntoPedido(pedido, payment);
    logMercadoPagoEvent({
      pedidoId: pedido.id,
      tipo: 'payment_verified',
      paymentId,
      estado: payment.status || '',
      detalle: payment.status_detail || '',
      payload: payment,
    });
    const hydrated = hydratePedido(synced);
    const io = req.app.get('io');
    if (io) io.emit('pedido_actualizado', hydrated);
    if (pedido.estado !== hydrated.estado) {
      await autoSendNotificationIfEnabled(hydrated, hydrated.estado, config.public_app_url || '').catch(() => null);
    }
    res.json(hydrated);
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo verificar el pago' });
  }
});

router.post('/webhook/mercadopago', async (req, res) => {
  const config = getConfigMap(db);
  if (!config.mercadopago_token) {
    return res.status(200).json({ ok: true });
  }

  const paymentId = req.query['data.id'] || req.body?.data?.id || req.body?.id;
  if (!paymentId) {
    return res.status(200).json({ ok: true });
  }

  try {
    const payment = await getPayment({ token: config.mercadopago_token, paymentId });
    const pedidoId = payment.external_reference;
    logMercadoPagoEvent({
      pedidoId: pedidoId || null,
      tipo: 'webhook',
      paymentId,
      estado: payment.status || '',
      detalle: payment.status_detail || '',
      payload: payment,
    });
    if (!pedidoId) return res.status(200).json({ ok: true });

    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
    if (!pedido) return res.status(200).json({ ok: true });

    const synced = syncPaymentIntoPedido(pedido, payment);
    const hydrated = hydratePedido(synced);
    const io = req.app.get('io');
    if (io) io.emit('pedido_actualizado', hydrated);
    if (pedido.estado !== hydrated.estado) {
      await autoSendNotificationIfEnabled(hydrated, hydrated.estado, config.public_app_url || '').catch(() => null);
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true });
  }
});

router.post('/interno', auth, requirePermission('tpv.use'), async (req, res) => {
  if (!req.body?.items) return res.status(400).json({ error: 'Items y total requeridos' });

  let normalized;
  try {
    normalized = buildPedidoPayload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo calcular el pedido' });
  }

  const pedido = createPedidoRecord({
    ...normalized,
    pago_estado: normalized.metodo_pago === 'mercadopago' ? 'pending' : 'pendiente',
  });
  const actor = actorFromRequest(req, 'Caja');
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'crear',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      numero: pedido.numero,
      total: Number(pedido.total || 0),
      tipo_entrega: normalized.tipo_entrega,
      metodo_pago: normalized.metodo_pago,
      origen: normalized.origen,
      mesa: normalized.mesa || '',
    },
  });
  const io = req.app.get('io');
  const hydrated = hydratePedido(pedido);
  if (io) io.emit('nuevo_pedido', hydrated);
  await autoSendNotificationIfEnabled(hydrated, 'nuevo', getConfigMap(db).public_app_url || '').catch(() => null);
  res.json(hydrated);
});

router.post('/', async (req, res) => {
  if (!req.body?.items) return res.status(400).json({ error: 'Items y total requeridos' });

  let normalized;
  try {
    normalized = buildPedidoPayload({ ...req.body, origen: 'web' });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo calcular el pedido' });
  }

  const pedido = createPedidoRecord({
    ...normalized,
    pago_estado: normalized.metodo_pago === 'mercadopago' ? 'pending' : 'pendiente',
  });
  const actor = actorFromRequest(req, 'Web publica');
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'crear',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      numero: pedido.numero,
      total: Number(pedido.total || 0),
      tipo_entrega: normalized.tipo_entrega,
      metodo_pago: normalized.metodo_pago,
      origen: 'web',
      mesa: normalized.mesa || '',
    },
  });
  const io = req.app.get('io');
  const hydrated = hydratePedido(pedido);
  if (io) io.emit('nuevo_pedido', hydrated);
  await autoSendNotificationIfEnabled(hydrated, 'nuevo', getConfigMap(db).public_app_url || '').catch(() => null);
  res.json(hydrated);
});

router.post('/:id/imprimir', auth, requirePermission('pedidos.print'), (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const tipo = req.body.tipo === 'comanda_cocina' ? 'comanda_cocina' : 'ticket_cliente';
  const copias = Math.max(1, Number(req.body.copias || configuredCopies(tipo)));
  const document = buildPrintDocument(db, pedido, tipo);
  const impresion = registerPrintJob(pedido.id, document.tipo, document.area, copias, document.payload, true);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'impresiones',
    accion: 'imprimir',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      tipo,
      copias,
      area: document.area,
      impresion_id: impresion.id,
    },
  });

  res.json({
    impresion,
    html: document.html,
  });
});

router.put('/:id/mover-mesa', auth, requirePermission('pedidos.edit'), (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  if (pedido.tipo_entrega !== 'mesa') {
    return res.status(400).json({ error: 'Solo se pueden mover pedidos de salon' });
  }

  if (['entregado', 'cancelado'].includes(pedido.estado)) {
    return res.status(400).json({ error: 'Ese pedido ya no esta abierto' });
  }

  const mesaDestino = String(req.body?.mesa_destino || '').trim();
  if (!mesaDestino) {
    return res.status(400).json({ error: 'Mesa destino requerida' });
  }

  db.prepare('UPDATE pedidos SET mesa = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(mesaDestino, pedido.id);
  const updated = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'mover_pedido',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      numero: pedido.numero,
      origen: pedido.mesa || '',
      destino: mesaDestino,
    },
  });

  const hydrated = hydratePedido(updated);
  const io = req.app.get('io');
  if (io) io.emit('pedido_actualizado', hydrated);
  res.json(hydrated);
});

router.post('/:id/dividir', auth, requirePermission('pedidos.edit'), (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  if (pedido.tipo_entrega !== 'mesa') {
    return res.status(400).json({ error: 'Solo se puede dividir una cuenta de salon' });
  }

  if (['entregado', 'cancelado'].includes(pedido.estado)) {
    return res.status(400).json({ error: 'Ese pedido ya no esta abierto' });
  }

  const itemQuantities = req.body?.items || [];
  const mesaDestino = String(req.body?.mesa_destino || pedido.mesa || '').trim();
  if (!mesaDestino) {
    return res.status(400).json({ error: 'Mesa destino requerida' });
  }

  try {
    const { original, nuevo } = splitPedidoMesa(pedido, itemQuantities, mesaDestino);
    const actor = actorFromRequest(req);
    logAudit(db, {
      modulo: 'mesas',
      accion: 'dividir_cuenta',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        numero_origen: pedido.numero,
        numero_nuevo: nuevo.numero,
        mesa_origen: pedido.mesa || '',
        mesa_destino: mesaDestino,
      },
    });

    const originalHydrated = hydratePedido(original);
    const nuevoHydrated = hydratePedido(nuevo);
    const io = req.app.get('io');
    if (io) {
      io.emit('pedido_actualizado', originalHydrated);
      io.emit('nuevo_pedido', nuevoHydrated);
    }

    res.json({
      original: originalHydrated,
      nuevo: nuevoHydrated,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo dividir la cuenta' });
  }
});

router.put('/:id/estado', auth, async (req, res) => {
  const { estado } = req.body;
  const validos = ['nuevo', 'confirmado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado'];
  if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado invalido' });

  const existing = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!canTransitionPedido(req.user, existing, estado)) {
    return res.status(403).json({ error: 'Sin permisos para cambiar este estado' });
  }
  if (estado === 'en_camino' && existing.tipo_entrega === 'delivery' && !existing.repartidor_id) {
    return res.status(400).json({ error: 'Asigna un repartidor antes de marcar el pedido en camino' });
  }
  if (estado === 'entregado' && existing.tipo_entrega === 'delivery') {
    const config = getConfigMap(db);
    if (existing.entrega_pin && String(req.body?.pin || '').trim() !== String(existing.entrega_pin)) {
      return res.status(400).json({ error: 'Hace falta validar el PIN de entrega' });
    }
    if (config.delivery_requiere_foto_entrega === '1' && !existing.entrega_foto) {
      return res.status(400).json({ error: 'La entrega requiere foto. Cerrala desde el modo rider o cargá la prueba primero.' });
    }
  }

  db.prepare('UPDATE pedidos SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(estado, req.params.id);
  let pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'cambiar_estado',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      numero: pedido.numero,
      desde: existing.estado,
      hacia: estado,
      tipo_entrega: pedido.tipo_entrega,
    },
  });

  let autoAssignedRepartidor = null;
  if (estado === 'listo' && pedido.tipo_entrega === 'delivery' && !pedido.repartidor_id) {
    const autoAssigned = autoAssignPedido(db, pedido.id);
    if (autoAssigned.ok) {
      pedido = autoAssigned.pedido;
      autoAssignedRepartidor = autoAssigned.repartidor;
      logAudit(db, {
        modulo: 'delivery',
        accion: 'auto_asignar',
        entidad: 'pedido',
        entidad_id: pedido.id,
        actor_id: actor.actor_id,
        actor_nombre: actor.actor_nombre,
        detalle: {
          numero: pedido.numero,
          repartidor_id: autoAssigned.repartidor.id,
          repartidor_nombre: autoAssigned.repartidor.nombre,
        },
      });
    }
  }

  if (pedido.cliente_id && existing.estado !== estado) {
    recalculateClienteStats(db, pedido.cliente_id);
  }

  if (estado === 'entregado' && pedido.repartidor_id) {
    db.prepare('UPDATE repartidores SET disponible = 1 WHERE id = ?').run(pedido.repartidor_id);
  }

  const io = req.app.get('io');
  const hydrated = hydratePedido(pedido);
  if (io) {
    io.emit('pedido_actualizado', hydrated);
    if (autoAssignedRepartidor) {
      io.emit('repartidor_ubicacion', db.prepare('SELECT * FROM repartidores WHERE id = ?').get(autoAssignedRepartidor.id));
    }
  }
  await autoSendNotificationIfEnabled(hydrated, hydrated.estado, getConfigMap(db).public_app_url || '').catch(() => null);
  res.json(hydrated);
});

router.put('/:id', auth, requirePermission('pedidos.edit'), (req, res) => {
  const { cliente_nombre, cliente_telefono, cliente_direccion, notas, metodo_pago, tipo_entrega, mesa, descuento } = req.body;
  db.prepare(
    'UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, cliente_direccion = ?, notas = ?, metodo_pago = ?, tipo_entrega = ?, mesa = ?, descuento = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(cliente_nombre, cliente_telefono, cliente_direccion, notas, metodo_pago, tipo_entrega, mesa, descuento, req.params.id);
  const updated = hydratePedido(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id));
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'editar',
    entidad: 'pedido',
    entidad_id: updated.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      numero: updated.numero,
      metodo_pago,
      tipo_entrega,
      mesa: mesa || '',
      descuento: Number(descuento || 0),
    },
  });
  res.json(updated);
});

module.exports = router;
