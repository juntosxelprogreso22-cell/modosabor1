const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { requirePermission } = require('../utils/permissions');
const { getCurrentShiftInfo, resolveShiftLabel } = require('../utils/shifts');

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function getConfigMap() {
  return db.prepare('SELECT clave, valor FROM configuracion').all().reduce((acc, row) => {
    acc[row.clave] = row.valor;
    return acc;
  }, {});
}

function getActiveCaja() {
  return db.prepare("SELECT * FROM cierres_caja WHERE estado = 'abierta' ORDER BY abierta_en DESC LIMIT 1").get();
}

function buildCajaResumen(desde, hasta = null) {
  const config = getConfigMap();
  let query = `
    SELECT *
    FROM pedidos
    WHERE datetime(creado_en) >= datetime(?)
  `;
  const params = [desde];

  if (hasta) {
    query += ' AND datetime(creado_en) <= datetime(?)';
    params.push(hasta);
  }

  query += ' ORDER BY datetime(creado_en) DESC';
  const rows = db.prepare(query).all(...params);
  const validRows = rows.filter((row) => row.estado !== 'cancelado');

  const totalVentas = validRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  const pedidos = validRows.length;
  const ticketPromedio = pedidos ? Math.round(totalVentas / pedidos) : 0;
  const efectivo = validRows
    .filter((row) => row.metodo_pago === 'efectivo')
    .reduce((acc, row) => acc + Number(row.total || 0), 0);
  const digitales = totalVentas - efectivo;

  const porMetodo = db.prepare(`
    SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
    FROM pedidos
    WHERE datetime(creado_en) >= datetime(?)
      ${hasta ? 'AND datetime(creado_en) <= datetime(?)' : ''}
      AND estado != 'cancelado'
    GROUP BY metodo_pago
    ORDER BY total DESC
  `).all(...params);

  const porTipo = db.prepare(`
    SELECT tipo_entrega, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
    FROM pedidos
    WHERE datetime(creado_en) >= datetime(?)
      ${hasta ? 'AND datetime(creado_en) <= datetime(?)' : ''}
      AND estado != 'cancelado'
    GROUP BY tipo_entrega
    ORDER BY total DESC
  `).all(...params);

  const entregados = rows.filter((row) => row.estado === 'entregado').length;
  const cancelados = rows.filter((row) => row.estado === 'cancelado').length;
  const activos = rows.filter((row) => !['entregado', 'cancelado'].includes(row.estado)).length;
  const porTurno = validRows.reduce((acc, row) => {
    const label = resolveShiftLabel(config, row.turno_operativo, new Date(String(row.creado_en || '').replace(' ', 'T')));
    const current = acc.get(label) || { turno: label, pedidos: 0, total: 0, efectivo: 0, digitales: 0 };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    if (row.metodo_pago === 'efectivo') current.efectivo += Number(row.total || 0);
    else current.digitales += Number(row.total || 0);
    acc.set(label, current);
    return acc;
  }, new Map());
  const turnoActual = getCurrentShiftInfo(config);

  return {
    desde,
    hasta,
    turnoActual: turnoActual.turno_actual?.nombre || turnoActual.turno_actual?.id || '',
    totalVentas,
    pedidos,
    ticketPromedio,
    efectivo,
    digitales,
    entregados,
    cancelados,
    activos,
    porMetodo,
    porTipo,
    porTurno: Array.from(porTurno.values()).map((item) => ({
      ...item,
      ticketPromedio: item.pedidos ? Math.round(item.total / item.pedidos) : 0,
    })).sort((a, b) => b.total - a.total || b.pedidos - a.pedidos),
  };
}

router.get('/estado', auth, requirePermission('caja.view'), (req, res) => {
  const activa = getActiveCaja();
  const historial = db.prepare('SELECT * FROM cierres_caja ORDER BY abierta_en DESC LIMIT 20').all()
    .map((item) => ({ ...item, resumen: safeJsonParse(item.resumen_json, {}) }));
  const auditoria = db.prepare('SELECT * FROM auditoria_eventos ORDER BY creado_en DESC LIMIT 40').all()
    .map((item) => ({ ...item, detalle: safeJsonParse(item.detalle, {}) }));

  res.json({
    activa: activa ? { ...activa, resumen: safeJsonParse(activa.resumen_json, {}) } : null,
    resumen: activa ? buildCajaResumen(activa.abierta_en) : null,
    historial,
    auditoria,
  });
});

router.post('/apertura', auth, requirePermission('caja.manage'), (req, res) => {
  if (getActiveCaja()) return res.status(400).json({ error: 'Ya hay una caja abierta' });

  const { monto_inicial = 0, notas = '' } = req.body;
  const actor = actorFromRequest(req);
  const result = db.prepare(`
    INSERT INTO cierres_caja (estado, abierta_por_id, abierta_por_nombre, monto_inicial, notas_apertura)
    VALUES ('abierta', ?, ?, ?, ?)
  `).run(actor.actor_id, actor.actor_nombre, Number(monto_inicial || 0), notas || '');

  const caja = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(result.lastInsertRowid);
  logAudit(db, {
    modulo: 'caja',
    accion: 'apertura',
    entidad: 'cierre_caja',
    entidad_id: caja.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { monto_inicial: Number(monto_inicial || 0), notas: notas || '' },
  });

  res.json(caja);
});

router.post('/cierre', auth, requirePermission('caja.manage'), (req, res) => {
  const activa = getActiveCaja();
  if (!activa) return res.status(400).json({ error: 'No hay una caja abierta' });

  const { monto_final_declarado = 0, notas = '' } = req.body;
  const actor = actorFromRequest(req);
  const resumen = buildCajaResumen(activa.abierta_en);
  const efectivoEsperado = Number(activa.monto_inicial || 0) + Number(resumen.efectivo || 0);
  const declarado = Number(monto_final_declarado || 0);
  const diferencia = declarado - efectivoEsperado;

  db.prepare(`
    UPDATE cierres_caja
    SET estado = 'cerrada',
        cerrada_en = CURRENT_TIMESTAMP,
        cerrada_por_id = ?,
        cerrada_por_nombre = ?,
        monto_final_declarado = ?,
        efectivo_esperado = ?,
        diferencia = ?,
        resumen_json = ?,
        notas_cierre = ?
    WHERE id = ?
  `).run(
    actor.actor_id,
    actor.actor_nombre,
    declarado,
    efectivoEsperado,
    diferencia,
    JSON.stringify(resumen),
    notas || '',
    activa.id
  );

  logAudit(db, {
    modulo: 'caja',
    accion: 'cierre',
    entidad: 'cierre_caja',
    entidad_id: activa.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      monto_final_declarado: declarado,
      efectivo_esperado: efectivoEsperado,
      diferencia,
      notas: notas || '',
    },
  });

  const caja = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(activa.id);
  res.json({ ...caja, resumen });
});

module.exports = router;
