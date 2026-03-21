const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { requirePermission } = require('../utils/permissions');
const { assignPedidoToRepartidor, autoAssignPedido } = require('../utils/deliveryAssignment');
const { estimateDeliveryEta } = require('../utils/deliveryEta');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `entrega-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function generateAccessCode() {
  return crypto.randomBytes(4).toString('hex');
}

function hydrateRepartidor(id) {
  const repartidor = db.prepare('SELECT * FROM repartidores WHERE id = ?').get(id);
  if (!repartidor) return null;
  if (repartidor.codigo_acceso) return repartidor;

  const codigo = generateAccessCode();
  db.prepare('UPDATE repartidores SET codigo_acceso = ? WHERE id = ?').run(codigo, id);
  return db.prepare('SELECT * FROM repartidores WHERE id = ?').get(id);
}

function hydratePedido(id) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!pedido) return null;
  if (!pedido.repartidor_id) return pedido;

  const repartidor = db.prepare(
    'SELECT id, nombre, telefono, vehiculo, latitud, longitud, ultima_ubicacion_en, zona_preferida FROM repartidores WHERE id = ?'
  ).get(pedido.repartidor_id);

  const eta = estimateDeliveryEta({ ...pedido, repartidor }, Object.fromEntries(
    db.prepare(`
      SELECT clave, valor
      FROM configuracion
      WHERE clave IN ('tiempo_delivery', 'tiempo_retiro')
    `).all().map((row) => [row.clave, row.valor || ''])
  ));

  return {
    ...pedido,
    repartidor: repartidor || null,
    eta_min_dinamico: eta.minutes,
    eta_origen: eta.source,
    distancia_repartidor_km: eta.distance_km,
    ubicacion_repartidor_atrasada: eta.stale_location,
  };
}

function validateRiderAccess(req, res) {
  const repartidor = hydrateRepartidor(req.params.id);
  if (!repartidor) {
    res.status(404).json({ error: 'Repartidor no encontrado' });
    return null;
  }

  if (req.params.codigo !== repartidor.codigo_acceso) {
    res.status(401).json({ error: 'Acceso invalido' });
    return null;
  }

  return repartidor;
}

router.get('/', auth, requirePermission('delivery.view'), (req, res) => {
  const rows = db.prepare('SELECT id FROM repartidores ORDER BY nombre ASC').all();
  res.json(rows.map((row) => hydrateRepartidor(row.id)));
});

router.post('/', auth, requirePermission('delivery.manage'), (req, res) => {
  const { nombre, telefono = '', vehiculo = '', zona_preferida = '' } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const r = db.prepare('INSERT INTO repartidores (nombre, telefono, vehiculo, zona_preferida, codigo_acceso) VALUES (?, ?, ?, ?, ?)').run(
    nombre,
    telefono,
    vehiculo,
    zona_preferida,
    generateAccessCode()
  );
  res.json(hydrateRepartidor(r.lastInsertRowid));
});

router.put('/:id', auth, requirePermission('delivery.manage'), (req, res) => {
  const { nombre, telefono, vehiculo, zona_preferida, activo, disponible } = req.body;
  db.prepare('UPDATE repartidores SET nombre=?, telefono=?, vehiculo=?, zona_preferida=?, activo=?, disponible=? WHERE id=?')
    .run(nombre, telefono, vehiculo, zona_preferida || '', activo, disponible, req.params.id);
  res.json(hydrateRepartidor(req.params.id));
});

router.delete('/:id', auth, requirePermission('delivery.manage'), (req, res) => {
  db.prepare('DELETE FROM repartidores WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.put('/:id/ubicacion', auth, requirePermission('delivery.manage'), (req, res) => {
  const { latitud, longitud } = req.body;
  const rep = hydrateRepartidor(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Repartidor no encontrado' });

  db.prepare(
    'UPDATE repartidores SET latitud = ?, longitud = ?, ultima_ubicacion_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(Number(latitud), Number(longitud), req.params.id);

  const updated = hydrateRepartidor(req.params.id);
  const io = req.app.get('io');
  if (io) io.emit('repartidor_ubicacion', updated);
  res.json(updated);
});

router.delete('/:id/ubicacion', auth, requirePermission('delivery.manage'), (req, res) => {
  const rep = hydrateRepartidor(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Repartidor no encontrado' });

  db.prepare(
    'UPDATE repartidores SET latitud = NULL, longitud = NULL, ultima_ubicacion_en = NULL WHERE id = ?'
  ).run(req.params.id);

  const updated = hydrateRepartidor(req.params.id);
  const io = req.app.get('io');
  if (io) io.emit('repartidor_ubicacion', updated);
  res.json(updated);
});

router.get('/:id/rider/:codigo', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const pedidoActivo = db.prepare(
    "SELECT * FROM pedidos WHERE repartidor_id = ? AND estado = 'en_camino' ORDER BY datetime(actualizado_en) DESC LIMIT 1"
  ).get(repartidor.id);

  res.json({
    repartidor,
    pedido: pedidoActivo ? hydratePedido(pedidoActivo.id) : null,
    settings: {
      delivery_requiere_foto_entrega: db.prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_requiere_foto_entrega'").get()?.valor === '1',
    },
  });
});

router.put('/:id/rider/:codigo/ubicacion', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const { latitud, longitud } = req.body;
  db.prepare(
    'UPDATE repartidores SET latitud = ?, longitud = ?, ultima_ubicacion_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(Number(latitud), Number(longitud), repartidor.id);

  const updated = hydrateRepartidor(repartidor.id);
  const pedidoActivo = db.prepare(
    "SELECT * FROM pedidos WHERE repartidor_id = ? AND estado = 'en_camino' ORDER BY datetime(actualizado_en) DESC LIMIT 1"
  ).get(repartidor.id);

  const io = req.app.get('io');
  if (io) {
    io.emit('repartidor_ubicacion', updated);
    if (pedidoActivo) io.emit('pedido_actualizado', hydratePedido(pedidoActivo.id));
  }

  res.json(updated);
});

router.post('/:id/rider/:codigo/entregar/:pedidoId', upload.single('foto'), (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND repartidor_id = ?').get(req.params.pedidoId, repartidor.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado para este repartidor' });
  const requiereFoto = db.prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_requiere_foto_entrega'").get()?.valor === '1';
  if (pedido.entrega_pin && String(req.body?.pin || '').trim() !== String(pedido.entrega_pin)) {
    return res.status(400).json({ error: 'PIN de entrega invalido' });
  }
  if (requiereFoto && !req.file) {
    return res.status(400).json({ error: 'Debes adjuntar una foto de entrega' });
  }

  db.prepare(`
    UPDATE pedidos
    SET estado = 'entregado',
        entrega_foto = COALESCE(NULLIF(?, ''), entrega_foto),
        entrega_foto_en = CASE WHEN ? != '' THEN CURRENT_TIMESTAMP ELSE entrega_foto_en END,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.file ? `/uploads/${req.file.filename}` : '', req.file ? `/uploads/${req.file.filename}` : '', pedido.id);
  db.prepare('UPDATE repartidores SET disponible = 1 WHERE id = ?').run(repartidor.id);

  const updatedPedido = hydratePedido(pedido.id);
  const updatedRepartidor = hydrateRepartidor(repartidor.id);
  const io = req.app.get('io');
  if (io) {
    io.emit('pedido_actualizado', updatedPedido);
    io.emit('repartidor_ubicacion', updatedRepartidor);
  }

  res.json({
    repartidor: updatedRepartidor,
    pedido: updatedPedido,
  });
});

router.post('/:id/asignar/:pedidoId', auth, requirePermission('delivery.manage'), (req, res) => {
  try {
    const assigned = assignPedidoToRepartidor(db, req.params.pedidoId, req.params.id);
    const pedido = hydratePedido(assigned.pedido.id);
    const io = req.app.get('io');
    if (io) {
      io.emit('pedido_actualizado', pedido);
      io.emit('repartidor_ubicacion', hydrateRepartidor(assigned.repartidor.id));
      if (assigned.previousRepartidorId) {
        io.emit('repartidor_ubicacion', hydrateRepartidor(assigned.previousRepartidorId));
      }
    }
    return res.json(pedido);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo asignar el repartidor' });
  }
});

router.post('/auto-asignar/:pedidoId', auth, requirePermission('delivery.manage'), (req, res) => {
  try {
    const assigned = autoAssignPedido(db, req.params.pedidoId);
    if (!assigned.ok) {
      return res.status(400).json({ error: 'No hay repartidores disponibles en este momento' });
    }

    const pedido = hydratePedido(assigned.pedido.id);
    const io = req.app.get('io');
    if (io) {
      io.emit('pedido_actualizado', pedido);
      io.emit('repartidor_ubicacion', hydrateRepartidor(assigned.repartidor.id));
    }
    return res.json({
      pedido,
      repartidor: hydrateRepartidor(assigned.repartidor.id),
      auto: true,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo autoasignar el pedido' });
  }
});

module.exports = router;
