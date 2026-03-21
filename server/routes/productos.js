const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requirePermission } = require('../utils/permissions');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function imagePathToFile(imagen) {
  if (!imagen) return null;
  return path.join(__dirname, '..', imagen.replace(/^\/+/, ''));
}

router.get('/', (req, res) => {
  const { categoria_id, activo } = req.query;
  let q = 'SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1';
  const params = [];
  if (categoria_id) { q += ' AND p.categoria_id = ?'; params.push(categoria_id); }
  if (activo !== undefined) { q += ' AND p.activo = ?'; params.push(Number(activo)); }
  q += ' ORDER BY c.orden ASC, p.nombre ASC';
  res.json(db.prepare(q).all(...params));
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT p.*, c.nombre as categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(p);
});

router.post('/', auth, requirePermission('productos.edit'), upload.single('imagen'), (req, res) => {
  const { nombre, descripcion = '', precio, costo = 0, categoria_id, variantes = '[]', extras = '[]', activo = 1, destacado = 0, tiempo_preparacion = 15 } = req.body;
  if (!nombre || !precio) return res.status(400).json({ error: 'Nombre y precio requeridos' });
  const imagen = req.file ? `/uploads/${req.file.filename}` : '';
  const r = db.prepare('INSERT INTO productos (nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras, activo, destacado, tiempo_preparacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(nombre, descripcion, precio, costo, categoria_id || null, imagen, variantes, extras, activo, destacado, tiempo_preparacion);
  res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', auth, requirePermission('productos.edit'), upload.single('imagen'), (req, res) => {
  const { nombre, descripcion, precio, costo, categoria_id, variantes, extras, activo, destacado, tiempo_preparacion } = req.body;
  const existing = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  const wantsRemoveImage = String(req.body.remove_imagen || '0') === '1';
  const imagen = req.file ? `/uploads/${req.file.filename}` : wantsRemoveImage ? '' : existing.imagen;

  if ((req.file || wantsRemoveImage) && existing.imagen) {
    const oldFile = imagePathToFile(existing.imagen);
    if (oldFile && fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  db.prepare('UPDATE productos SET nombre=?, descripcion=?, precio=?, costo=?, categoria_id=?, imagen=?, variantes=?, extras=?, activo=?, destacado=?, tiempo_preparacion=? WHERE id=?')
    .run(nombre, descripcion, precio, costo, categoria_id || null, imagen, variantes, extras, activo, destacado, tiempo_preparacion, req.params.id);
  res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id));
});

router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const p = db.prepare('SELECT imagen FROM productos WHERE id = ?').get(req.params.id);
  if (p?.imagen) {
    const file = imagePathToFile(p.imagen);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
