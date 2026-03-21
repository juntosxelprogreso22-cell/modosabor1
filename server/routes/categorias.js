const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');

const uploadDir = path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => cb(null, `categoria-${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 } });

function parseSubcategorias(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item?.nombre?.trim());

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.nombre?.trim());
  } catch {
    return [];
  }
}

function normalizeCategoria(row) {
  if (!row) return row;

  return {
    ...row,
    imagen: row.imagen || '',
    subcategorias: parseSubcategorias(row.subcategorias),
  };
}

function imagePathToFile(imagen) {
  if (!imagen) return null;
  return path.join(__dirname, '..', imagen.replace(/^\/+/, ''));
}

router.get('/', (_req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden ASC, nombre ASC').all();
  res.json(categorias.map(normalizeCategoria));
});

router.get('/:id', (_req, res) => {
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(_req.params.id);
  if (!categoria) return res.status(404).json({ error: 'Categoria no encontrada' });
  res.json(normalizeCategoria(categoria));
});

router.post('/', auth, requirePermission('productos.edit'), upload.single('imagen'), (req, res) => {
  const { nombre, icono = '🍽️', color = '#f97316', orden = 0, activo = 1 } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  const subcategorias = JSON.stringify(parseSubcategorias(req.body.subcategorias));
  const imagen = req.file ? `/uploads/${req.file.filename}` : '';

  const result = db
    .prepare('INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(nombre, icono, color, Number(orden) || 0, Number(activo) === 1 ? 1 : 0, imagen, subcategorias);

  const created = db.prepare('SELECT * FROM categorias WHERE id = ?').get(result.lastInsertRowid);
  res.json(normalizeCategoria(created));
});

router.put('/:id', auth, requirePermission('productos.edit'), upload.single('imagen'), (req, res) => {
  const existing = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Categoria no encontrada' });

  const nombre = req.body.nombre ?? existing.nombre;
  const icono = req.body.icono ?? existing.icono;
  const color = req.body.color ?? existing.color;
  const orden = req.body.orden ?? existing.orden;
  const activo = req.body.activo ?? existing.activo;
  const subcategorias = JSON.stringify(parseSubcategorias(req.body.subcategorias ?? existing.subcategorias));
  const wantsRemoveImage = String(req.body.remove_imagen || '0') === '1';
  const imagen = req.file ? `/uploads/${req.file.filename}` : wantsRemoveImage ? '' : existing.imagen || '';

  if ((req.file || wantsRemoveImage) && existing.imagen) {
    const oldFile = imagePathToFile(existing.imagen);
    if (oldFile && fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  db.prepare('UPDATE categorias SET nombre=?, icono=?, color=?, orden=?, activo=?, imagen=?, subcategorias=? WHERE id=?').run(
    nombre,
    icono,
    color,
    Number(orden) || 0,
    Number(activo) === 1 ? 1 : 0,
    imagen,
    subcategorias,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
  res.json(normalizeCategoria(updated));
});

router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const categoria = db.prepare('SELECT imagen FROM categorias WHERE id = ?').get(req.params.id);
  if (categoria?.imagen) {
    const file = imagePathToFile(categoria.imagen);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  }

  db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
