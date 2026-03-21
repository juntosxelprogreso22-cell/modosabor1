const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { getCurrentShiftInfo, matchesPreferredShift } = require('../utils/shifts');

function getConfigMap() {
  return db.prepare('SELECT clave, valor FROM configuracion').all().reduce((acc, row) => {
    acc[row.clave] = row.valor;
    return acc;
  }, {});
}

router.get('/', auth, requirePermission('config.manage'), (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email
    FROM personal p
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    ORDER BY p.activo DESC, p.rol_operativo ASC, p.nombre ASC
  `).all();
  const config = getConfigMap();
  const shiftInfo = getCurrentShiftInfo(config);
  const currentShiftId = shiftInfo.turno_actual?.id || '';
  const currentShiftLabel = shiftInfo.turno_actual?.nombre || '';

  const resumenTurnos = rows.reduce((acc, item) => {
    const key = item.turno_preferido || 'sin_turno';
    const current = acc[key] || { turno: key, total: 0, activos: 0 };
    current.total += 1;
    if (item.activo) current.activos += 1;
    acc[key] = current;
    return acc;
  }, {});

  const porRol = rows.reduce((acc, item) => {
    const key = item.rol_operativo || 'sin_rol';
    const current = acc[key] || { rol: key, total: 0, activos: 0 };
    current.total += 1;
    if (item.activo) current.activos += 1;
    acc[key] = current;
    return acc;
  }, {});

  const equipoTurnoActual = rows.filter((item) => item.activo && matchesPreferredShift(item.turno_preferido, currentShiftId));

  res.json({
    items: rows,
    turno_actual: currentShiftLabel,
    turno_actual_id: currentShiftId,
    turnos: shiftInfo.turnos,
    resumen_turnos: Object.values(resumenTurnos),
    por_rol: Object.values(porRol),
    equipo_turno_actual: equipoTurnoActual,
  });
});

router.post('/', auth, requirePermission('config.manage'), (req, res) => {
  const {
    nombre,
    rol_operativo = 'cocina',
    telefono = '',
    turno_preferido = '',
    usuario_id = null,
    activo = 1,
    notas = '',
  } = req.body || {};

  if (!String(nombre || '').trim()) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  const result = db.prepare(`
    INSERT INTO personal (nombre, rol_operativo, telefono, turno_preferido, usuario_id, activo, notas, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    String(nombre).trim(),
    String(rol_operativo || 'cocina'),
    String(telefono || '').trim(),
    String(turno_preferido || '').trim(),
    usuario_id || null,
    activo ? 1 : 0,
    String(notas || '').trim()
  );

  const row = db.prepare('SELECT * FROM personal WHERE id = ?').get(result.lastInsertRowid);
  res.json(row);
});

router.put('/:id', auth, requirePermission('config.manage'), (req, res) => {
  const existing = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Personal no encontrado' });
  }

  const payload = {
    nombre: req.body.nombre ?? existing.nombre,
    rol_operativo: req.body.rol_operativo ?? existing.rol_operativo,
    telefono: req.body.telefono ?? existing.telefono,
    turno_preferido: req.body.turno_preferido ?? existing.turno_preferido,
    usuario_id: req.body.usuario_id ?? existing.usuario_id,
    activo: req.body.activo ?? existing.activo,
    notas: req.body.notas ?? existing.notas,
  };

  db.prepare(`
    UPDATE personal
    SET nombre = ?, rol_operativo = ?, telefono = ?, turno_preferido = ?, usuario_id = ?, activo = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(payload.nombre || '').trim(),
    String(payload.rol_operativo || 'cocina'),
    String(payload.telefono || '').trim(),
    String(payload.turno_preferido || '').trim(),
    payload.usuario_id || null,
    payload.activo ? 1 : 0,
    String(payload.notas || '').trim(),
    req.params.id
  );

  const row = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/:id', auth, requirePermission('config.manage'), (req, res) => {
  db.prepare('DELETE FROM personal WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
