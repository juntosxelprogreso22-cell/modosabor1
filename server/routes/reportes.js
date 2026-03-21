const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { resolveShiftLabel } = require('../utils/shifts');

function toDateOnly(value) {
  return new Date(value).toISOString().split('T')[0];
}

function parseDateRange(req) {
  const today = new Date();
  const hasta = req.query.hasta || toDateOnly(today);
  const desde = req.query.desde || toDateOnly(new Date(today.getTime() - 6 * 86400000));
  return { desde, hasta };
}

function parseItems(raw) {
  try {
    const items = JSON.parse(raw || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function diffMinutes(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

function getConfigMap() {
  return db.prepare('SELECT clave, valor FROM configuracion').all().reduce((acc, row) => {
    acc[row.clave] = row.valor;
    return acc;
  }, {});
}

function groupByDay(rows, desde, hasta) {
  const byDate = new Map();
  rows.forEach((row) => {
    const key = String(row.creado_en || '').slice(0, 10);
    const current = byDate.get(key) || { fecha: key, total: 0, pedidos: 0 };
    current.total += Number(row.total || 0);
    current.pedidos += 1;
    byDate.set(key, current);
  });

  const result = [];
  const current = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);
  while (current <= end) {
    const key = toDateOnly(current);
    result.push(byDate.get(key) || { fecha: key, total: 0, pedidos: 0 });
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function groupByHour(rows) {
  const base = Array.from({ length: 24 }, (_, index) => ({
    hora: `${String(index).padStart(2, '0')}:00`,
    pedidos: 0,
    total: 0,
  }));

  rows.forEach((row) => {
    const created = new Date(row.creado_en);
    const hour = created.getHours();
    if (Number.isInteger(hour) && base[hour]) {
      base[hour].pedidos += 1;
      base[hour].total += Number(row.total || 0);
    }
  });

  return base;
}

function groupByShift(rows, config) {
  const map = new Map();
  rows.forEach((row) => {
    const key = resolveShiftLabel(config, row.turno_operativo, new Date(String(row.creado_en || '').replace(' ', 'T')));
    const current = map.get(key) || { turno: key, pedidos: 0, total: 0, delivery: 0, retiro: 0, mesa: 0 };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    current[row.tipo_entrega] = (current[row.tipo_entrega] || 0) + 1;
    map.set(key, current);
  });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      ticketPromedio: item.pedidos ? Math.round(item.total / item.pedidos) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.pedidos - a.pedidos);
}

function buildProductAnalytics(rows) {
  const productos = db.prepare(`
    SELECT p.id, p.nombre, p.costo, c.nombre as categoria
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
  `).all();
  const byId = new Map(productos.map((item) => [item.id, item]));
  const productMap = new Map();
  const categoryMap = new Map();
  let totalCosto = 0;

  rows.forEach((pedido) => {
    const items = parseItems(pedido.items);
    items.forEach((item) => {
      const cantidad = Number(item.cantidad || 0);
      const lineTotal = Number(item.precio_unitario || 0) * cantidad;
      const dbProduct = byId.get(item.producto_id);
      const name = item.nombre || dbProduct?.nombre || 'Producto';
      const category = dbProduct?.categoria || 'Sin categoria';
      const costUnit = Number(dbProduct?.costo || 0);
      const lineCost = costUnit * cantidad;
      const lineMargin = lineTotal - lineCost;
      totalCosto += lineCost;

      const productCurrent = productMap.get(name) || {
        nombre: name,
        cantidad: 0,
        total: 0,
        costo: 0,
        margen: 0,
        categoria: category,
      };
      productCurrent.cantidad += cantidad;
      productCurrent.total += lineTotal;
      productCurrent.costo += lineCost;
      productCurrent.margen += lineMargin;
      productMap.set(name, productCurrent);

      const categoryCurrent = categoryMap.get(category) || {
        categoria: category,
        cantidad: 0,
        total: 0,
        costo: 0,
        margen: 0,
      };
      categoryCurrent.cantidad += cantidad;
      categoryCurrent.total += lineTotal;
      categoryCurrent.costo += lineCost;
      categoryCurrent.margen += lineMargin;
      categoryMap.set(category, categoryCurrent);
    });
  });

  const topProductos = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)
    .slice(0, 8);

  const topCategorias = Array.from(categoryMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)
    .slice(0, 6);

  const productosRentables = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .sort((a, b) => b.margen - a.margen || b.total - a.total)
    .slice(0, 8);

  const productosBajoMargen = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => a.margenPct - b.margenPct || a.margen - b.margen || b.total - a.total)
    .slice(0, 8);

  return { topProductos, topCategorias, productosRentables, productosBajoMargen, totalCosto };
}

function buildClientAnalytics(rows, desde, hasta) {
  const clientesPeriodo = db.prepare(`
    SELECT
      COALESCE(cliente_id, 0) AS cliente_id,
      COALESCE(NULLIF(cliente_nombre, ''), 'Consumidor final') AS nombre,
      COALESCE(NULLIF(cliente_telefono, ''), '') AS telefono,
      COUNT(*) AS pedidos,
      COALESCE(SUM(total), 0) AS total
    FROM pedidos
    WHERE DATE(creado_en) BETWEEN ? AND ? AND estado != 'cancelado'
    GROUP BY COALESCE(cliente_id, 0), COALESCE(NULLIF(cliente_nombre, ''), 'Consumidor final'), COALESCE(NULLIF(cliente_telefono, ''), '')
    ORDER BY total DESC, pedidos DESC
    LIMIT 8
  `).all(desde, hasta);

  const clientesInactivos = db.prepare(`
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.total_gastado,
      c.total_pedidos,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    GROUP BY c.id
    HAVING ultima_compra = '' OR julianday('now') - julianday(ultima_compra) >= 30
    ORDER BY ultima_compra ASC, c.total_gastado DESC
    LIMIT 8
  `).all();

  const activosUnicos = new Set(
    rows
      .map((pedido) => pedido.cliente_id || `${pedido.cliente_nombre || ''}-${pedido.cliente_telefono || ''}`)
      .filter(Boolean)
  ).size;

  const clientesBase = db.prepare(`
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.total_gastado,
      c.total_pedidos,
      c.nivel,
      c.fecha_nacimiento,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    GROUP BY c.id
  `).all();

  const totalGastadoPromedio = clientesBase.length
    ? clientesBase.reduce((acc, cliente) => acc + Number(cliente.total_gastado || 0), 0) / clientesBase.length
    : 0;

  const segmentos = clientesBase.reduce((acc, cliente) => {
    const ultima = cliente.ultima_compra ? new Date(cliente.ultima_compra).getTime() : 0;
    const diasInactivo = ultima ? Math.max(0, Math.floor((Date.now() - ultima) / 86400000)) : 999;
    if (['Oro', 'Platino'].includes(cliente.nivel) || Number(cliente.total_pedidos || 0) >= 10) acc.vip += 1;
    if (diasInactivo >= 30) acc.inactivos += 1;
    if (diasInactivo >= 30 && diasInactivo < 60) acc.riesgo += 1;
    if (diasInactivo >= 60) acc.perdidos += 1;
    if (Number(cliente.total_pedidos || 0) >= 5) acc.recurrentes += 1;
    if (Number(cliente.total_gastado || 0) >= totalGastadoPromedio && Number(cliente.total_pedidos || 0) >= 2) acc.altoValor += 1;
    if (
      cliente.fecha_nacimiento &&
      String(cliente.fecha_nacimiento).slice(5, 7) === new Date().toISOString().slice(5, 7)
    ) {
      acc.cumpleMes += 1;
    }
    return acc;
  }, {
    vip: 0,
    riesgo: 0,
    perdidos: 0,
    inactivos: 0,
    recurrentes: 0,
    altoValor: 0,
    cumpleMes: 0,
  });

  const recompraPct = activosUnicos > 0
    ? Math.round((clientesPeriodo.filter((cliente) => Number(cliente.pedidos || 0) >= 2).length / activosUnicos) * 100)
    : 0;

  return { topClientes: clientesPeriodo, clientesInactivos, activosUnicos, segmentos, recompraPct };
}

function buildDeliveryAnalytics(rows, desde, hasta) {
  const deliveryRows = rows.filter((row) => row.tipo_entrega === 'delivery');
  const tiempos = deliveryRows
    .filter((row) => row.estado === 'entregado')
    .map((row) => diffMinutes(row.creado_en, row.actualizado_en))
    .filter((value) => value !== null);

  const average = tiempos.length
    ? Math.round(tiempos.reduce((acc, value) => acc + value, 0) / tiempos.length)
    : 0;
  const etaDiffs = deliveryRows
    .filter((row) => row.estado === 'entregado' && Number(row.tiempo_estimado_min || 0) > 0)
    .map((row) => {
      const actual = diffMinutes(row.creado_en, row.actualizado_en);
      const estimated = Number(row.tiempo_estimado_min || 0);
      if (actual === null) return null;
      return {
        actual,
        estimated,
        diff: actual - estimated,
      };
    })
    .filter(Boolean);

  const desviacionPromedioEta = etaDiffs.length
    ? Math.round(etaDiffs.reduce((acc, item) => acc + Math.abs(item.diff), 0) / etaDiffs.length)
    : 0;
  const puntualidadPct = etaDiffs.length
    ? Math.round((etaDiffs.filter((item) => item.actual <= item.estimated + 5).length / etaDiffs.length) * 100)
    : 0;

  const riderMap = new Map();
  deliveryRows.forEach((row) => {
    const key = row.repartidor_nombre || 'Sin asignar';
    const current = riderMap.get(key) || {
      nombre: key,
      entregas: 0,
      total: 0,
      tiempos: [],
      etaDiffs: [],
      conFoto: 0,
    };
    current.total += Number(row.total || 0);
    if (row.estado === 'entregado') {
      current.entregas += 1;
      const actual = diffMinutes(row.creado_en, row.actualizado_en);
      if (actual !== null) current.tiempos.push(actual);
      if (Number(row.tiempo_estimado_min || 0) > 0 && actual !== null) {
        current.etaDiffs.push(actual - Number(row.tiempo_estimado_min || 0));
      }
      if (row.entrega_foto) current.conFoto += 1;
    }
    riderMap.set(key, current);
  });

  const ranking = Array.from(riderMap.values())
    .map((item) => {
      const tiempoPromedio = item.tiempos.length
        ? Math.round(item.tiempos.reduce((acc, value) => acc + value, 0) / item.tiempos.length)
        : 0;
      const desviacionEta = item.etaDiffs.length
        ? Math.round(item.etaDiffs.reduce((acc, value) => acc + Math.abs(value), 0) / item.etaDiffs.length)
        : 0;
      const puntualidad = item.etaDiffs.length
        ? Math.round((item.etaDiffs.filter((value) => value <= 5).length / item.etaDiffs.length) * 100)
        : 0;
      const fotoPct = item.entregas ? Math.round((item.conFoto / item.entregas) * 100) : 0;
      return {
        nombre: item.nombre,
        entregas: item.entregas,
        total: item.total,
        ticketPromedio: item.entregas ? Math.round(item.total / item.entregas) : 0,
        tiempoPromedio,
        desviacionEta,
        puntualidadPct: puntualidad,
        fotoPct,
      };
    })
    .sort((a, b) => b.entregas - a.entregas || b.total - a.total)
    .slice(0, 8);

  const byZone = deliveryRows.reduce((acc, row) => {
    const key = row.delivery_zona || 'Sin zona';
    const current = acc.get(key) || { zona: key, pedidos: 0, total: 0, envio: 0, neto: 0 };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    current.envio += Number(row.costo_envio || 0);
    current.neto += Number(row.total || 0) - Number(row.costo_envio || 0);
    acc.set(key, current);
    return acc;
  }, new Map());

  return {
    ranking,
    tiempoPromedio: average,
    desviacionPromedioEta,
    puntualidadPct,
    totalPedidos: deliveryRows.length,
    totalVentas: deliveryRows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    zonas: Array.from(byZone.values()).sort((a, b) => b.total - a.total || b.pedidos - a.pedidos).slice(0, 8),
  };
}

function buildSalonAnalytics(rows) {
  const mesas = rows
    .filter((row) => row.tipo_entrega === 'mesa' && row.mesa)
    .reduce((acc, row) => {
      const key = String(row.mesa);
      const current = acc.get(key) || { mesa: key, pedidos: 0, total: 0 };
      current.pedidos += 1;
      current.total += Number(row.total || 0);
      acc.set(key, current);
      return acc;
    }, new Map());

  const topMesas = Array.from(mesas.values())
    .sort((a, b) => b.total - a.total || b.pedidos - a.pedidos)
    .slice(0, 8);

  const salonRows = rows.filter((row) => row.tipo_entrega === 'mesa');
  const ticketPromedio = salonRows.length
    ? Math.round(salonRows.reduce((acc, row) => acc + Number(row.total || 0), 0) / salonRows.length)
    : 0;

  return {
    topMesas,
    totalPedidos: salonRows.length,
    totalVentas: salonRows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    ticketPromedio,
  };
}

function buildBirthdayAnalytics() {
  return db.prepare(`
    SELECT id, nombre, telefono, fecha_nacimiento, total_gastado, total_pedidos
    FROM clientes
    WHERE fecha_nacimiento != ''
      AND strftime('%m', fecha_nacimiento) = strftime('%m', 'now')
    ORDER BY strftime('%d', fecha_nacimiento) ASC, total_gastado DESC
    LIMIT 10
  `).all();
}

router.get('/dashboard', auth, requirePermission('dashboard.view'), (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const ventasHoy = db.prepare("SELECT COUNT(*) as pedidos, COALESCE(SUM(total),0) as total FROM pedidos WHERE DATE(creado_en)=? AND estado!='cancelado'").get(hoy);
  const ventasAyer = db.prepare("SELECT COALESCE(SUM(total),0) as total FROM pedidos WHERE DATE(creado_en)=? AND estado!='cancelado'").get(ayer);
  const pedidosActivos = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE estado NOT IN ('entregado','cancelado')").get();
  const clientesTotal = db.prepare('SELECT COUNT(*) as c FROM clientes').get();

  const ventas7dias = db.prepare(`
    SELECT DATE(creado_en) as fecha, COUNT(*) as pedidos, COALESCE(SUM(total),0) as total
    FROM pedidos WHERE DATE(creado_en) >= DATE('now','-6 days') AND estado!='cancelado'
    GROUP BY DATE(creado_en) ORDER BY fecha ASC
  `).all();

  const porMetodoPago = db.prepare(`
    SELECT metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(total),0) as total
    FROM pedidos WHERE DATE(creado_en)=? AND estado!='cancelado' GROUP BY metodo_pago
  `).all(hoy);

  const ultimosPedidos = db.prepare("SELECT * FROM pedidos ORDER BY creado_en DESC LIMIT 5").all();

  res.json({ ventasHoy, ventasAyer: ventasAyer.total, pedidosActivos: pedidosActivos.c, clientesTotal: clientesTotal.c, ventas7dias, porMetodoPago, ultimosPedidos });
});

router.get('/ventas', auth, requirePermission('reportes.view'), (req, res) => {
  const { desde, hasta } = parseDateRange(req);
  const pedidos = db.prepare("SELECT * FROM pedidos WHERE DATE(creado_en) BETWEEN ? AND ? AND estado!='cancelado' ORDER BY creado_en DESC").all(desde, hasta);
  const totales = db.prepare("SELECT COUNT(*) as cantidad, COALESCE(SUM(total),0) as total FROM pedidos WHERE DATE(creado_en) BETWEEN ? AND ? AND estado!='cancelado'").get(desde, hasta);
  res.json({ pedidos, totales });
});

router.get('/premium', auth, requirePermission('reportes.view'), (req, res) => {
  const { desde, hasta } = parseDateRange(req);
  const config = getConfigMap();

  const rows = db.prepare(`
    SELECT *
    FROM pedidos
    WHERE DATE(creado_en) BETWEEN ? AND ?
    ORDER BY datetime(creado_en) DESC
  `).all(desde, hasta);

  const validRows = rows.filter((row) => row.estado !== 'cancelado');
  const entregados = validRows.filter((row) => row.estado === 'entregado');
  const cancelados = rows.filter((row) => row.estado === 'cancelado').length;

  const totalVentas = validRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  const cantidadPedidos = validRows.length;
  const ticketPromedio = cantidadPedidos ? Math.round(totalVentas / cantidadPedidos) : 0;
  const leadTimes = entregados
    .map((row) => diffMinutes(row.creado_en, row.actualizado_en))
    .filter((value) => value !== null);
  const tiempoPromedio = leadTimes.length
    ? Math.round(leadTimes.reduce((acc, value) => acc + value, 0) / leadTimes.length)
    : 0;

  const paymentMethods = db.prepare(`
    SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
    FROM pedidos
    WHERE DATE(creado_en) BETWEEN ? AND ? AND estado != 'cancelado'
    GROUP BY metodo_pago
    ORDER BY total DESC
  `).all(desde, hasta);

  const deliveryCount = validRows.filter((row) => row.tipo_entrega === 'delivery').length;
  const retiroCount = validRows.filter((row) => row.tipo_entrega === 'retiro').length;
  const mesaCount = validRows.filter((row) => row.tipo_entrega === 'mesa').length;
  const origins = validRows.reduce((acc, row) => {
    const key = row.origen || 'sin_origen';
    const current = acc.get(key) || { origen: key, pedidos: 0, total: 0 };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    acc.set(key, current);
    return acc;
  }, new Map());

  const productos = buildProductAnalytics(validRows);
  const totalCosto = productos.totalCosto || 0;
  const margenBruto = totalVentas - totalCosto;
  const margenPct = totalVentas > 0 ? Math.round((margenBruto / totalVentas) * 100) : 0;
  const clientes = buildClientAnalytics(validRows, desde, hasta);
  const delivery = buildDeliveryAnalytics(validRows, desde, hasta);
  const salon = buildSalonAnalytics(validRows);
  const cumpleMes = buildBirthdayAnalytics();

  res.json({
    rango: { desde, hasta },
    resumen: {
      totalVentas,
      totalCosto,
      margenBruto,
      margenPct,
      cantidadPedidos,
      ticketPromedio,
      entregados: entregados.length,
      cancelados,
      tiempoPromedio,
      deliveryCount,
      retiroCount,
      mesaCount,
      clientesActivos: clientes.activosUnicos,
    },
    series: {
      ventasPorDia: groupByDay(validRows, desde, hasta),
      ventasPorHora: groupByHour(validRows),
      ventasPorTurno: groupByShift(validRows, config),
      ventasPorOrigen: Array.from(origins.values()).sort((a, b) => b.total - a.total || b.pedidos - a.pedidos),
    },
    products: productos,
    clients: {
      ...clientes,
      cumpleMes,
    },
    delivery,
    salon,
    paymentMethods,
    recentOrders: validRows.slice(0, 12),
  });
});

module.exports = router;
