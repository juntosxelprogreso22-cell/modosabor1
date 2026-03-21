const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { getConfigMap, getMe } = require('../utils/mercadoPago');
const { getWhatsAppStatus, sendWhatsAppText, normalizeWhatsAppPhone } = require('../utils/whatsapp');
const { requirePermission } = require('../utils/permissions');
const { quoteDelivery, serializeZones } = require('../utils/deliveryZones');
const { buildPrintTestDocument } = require('../utils/printTemplates');
const { getCurrentShiftInfo } = require('../utils/shifts');
const {
  listBackups,
  createDatabaseBackup,
  backupsDir,
  resetOperationalData,
  restoreDatabaseBackup,
} = require('../utils/backupManager');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

const SENSITIVE_KEYS = new Set([
  'mercadopago_token',
  'whatsapp_api_token',
  'openai_api_key',
]);

function rowsToConfig(rows) {
  const config = {};
  rows.forEach((row) => {
    config[row.clave] = row.valor;
  });
  return config;
}

function getFullConfig() {
  const rows = db.prepare('SELECT * FROM configuracion').all();
  const config = rowsToConfig(rows);
  return {
    ...config,
    ...getCurrentShiftInfo(config),
  };
}

function getPublicConfig() {
  const config = getFullConfig();
  SENSITIVE_KEYS.forEach((key) => {
    delete config[key];
  });
  return config;
}

router.get('/', (req, res) => {
  res.json(getPublicConfig());
});

router.get('/admin', auth, requirePermission('config.manage'), (req, res) => {
  res.json(getFullConfig());
});

router.get('/mercadopago/status', auth, requirePermission('config.manage'), async (req, res) => {
  const config = getFullConfig();
  const appUrl = config.public_app_url || '';
  const apiUrl = config.public_api_url || '';
  const token = config.mercadopago_token || '';
  const appUrlIsHttp = /^https?:\/\//.test(appUrl);
  const apiUrlIsHttp = /^https?:\/\//.test(apiUrl);
  const appUrlIsHttps = /^https:\/\//.test(appUrl);
  const apiUrlIsHttps = /^https:\/\//.test(apiUrl);
  const baseStatus = {
    configured: Boolean(token),
    app_url: appUrl,
    api_url: apiUrl,
    webhook_url: apiUrl ? `${String(apiUrl).replace(/\/$/, '')}/api/pedidos/webhook/mercadopago` : '',
    checks: {
      token: Boolean(token),
      app_url: appUrlIsHttp,
      api_url: apiUrlIsHttp,
    },
    production_checks: {
      app_https: appUrlIsHttps,
      api_https: apiUrlIsHttps,
      webhook_public: apiUrlIsHttps && !/localhost|127\.0\.0\.1/i.test(apiUrl),
    },
  };

  if (!token) {
    return res.json({
      ...baseStatus,
      ready: false,
      account: null,
      message: 'Falta configurar el access token de MercadoPago',
    });
  }

  try {
    const account = await getMe({ token });
    const checks = {
      ...baseStatus.checks,
      account: true,
    };
    const ready = Object.values(checks).every(Boolean);
    const productionReady = Object.values(baseStatus.production_checks).every(Boolean);
    return res.json({
      ...baseStatus,
      checks,
      ready,
      production_ready: productionReady,
      account: {
        id: account.id,
        nickname: account.nickname,
        email: account.email,
        site_id: account.site_id,
      },
      message: ready ? 'MercadoPago listo para probar' : 'MercadoPago conectado, pero faltan URLs publicas validas',
      production_message: productionReady
        ? 'Listo para produccion'
        : 'Para produccion conviene usar URLs https publicas y webhook accesible desde internet',
    });
  } catch (error) {
    return res.json({
      ...baseStatus,
      ready: false,
      production_ready: false,
      account: null,
      checks: {
        ...baseStatus.checks,
        account: false,
      },
      message: error.message || 'No se pudo validar la cuenta de MercadoPago',
      production_message: 'No se pudo validar la cuenta de MercadoPago',
    });
  }
});

router.get('/mercadopago/eventos', auth, requirePermission('config.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM mercadopago_eventos
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 30
  `).all();
  res.json(rows);
});

router.get('/whatsapp/status', auth, requirePermission('config.manage'), async (req, res) => {
  const config = getFullConfig();
  const status = getWhatsAppStatus(config);

  let message = 'WhatsApp en modo manual';
  if (status.mode === 'api') {
    message = status.ready
      ? 'WhatsApp API listo para enviar'
      : 'Faltan credenciales para usar WhatsApp API';
  }

  res.json({
    ...status,
    message,
  });
});

router.post('/delivery/cotizar', (req, res) => {
  const config = getPublicConfig();
  const direccion = String(req.body?.direccion || '').trim();
  const quote = quoteDelivery(config, direccion);
  res.json({
    ...quote,
    direccion,
  });
});

router.get('/impresion/test', auth, requirePermission('config.manage'), (req, res) => {
  const document = buildPrintTestDocument(db);
  res.json(document);
});

router.get('/backups', auth, requirePermission('config.manage'), (_req, res) => {
  res.json({
    dir: backupsDir,
    backups: listBackups(),
  });
});

router.post('/backups', auth, requirePermission('config.manage'), (req, res) => {
  const maxFiles = Number(req.body?.maxFiles || getFullConfig().backup_max_archivos || 14);
  const backup = createDatabaseBackup(db, { reason: 'manual', maxFiles });
  res.json(backup);
});

router.get('/backups/:file/download', auth, requirePermission('config.manage'), (req, res) => {
  const target = listBackups().find((entry) => entry.file === req.params.file);
  if (!target) {
    return res.status(404).json({ error: 'Backup no encontrado' });
  }
  return res.download(path.join(backupsDir, target.file));
});

router.post('/backups/:file/restore', auth, requirePermission('config.manage'), (req, res) => {
  if (String(req.body?.confirmacion || '').trim().toUpperCase() !== 'RESTAURAR') {
    return res.status(400).json({ error: 'Debes escribir RESTAURAR para confirmar' });
  }

  const target = listBackups().find((entry) => entry.file === req.params.file);
  if (!target) {
    return res.status(404).json({ error: 'Backup no encontrado' });
  }

  const safetyBackup = createDatabaseBackup(db, {
    reason: 'pre-restore',
    maxFiles: Number(getFullConfig().backup_max_archivos || 14),
  });
  const restored = restoreDatabaseBackup(db, target.file, { mode: 'full' });

  return res.json({
    ok: true,
    message: 'Backup restaurado correctamente',
    restored,
    safety_backup: safetyBackup,
    backups: listBackups(),
  });
});

router.post('/reset', auth, requirePermission('config.manage'), (req, res) => {
  if (String(req.body?.confirmacion || '').trim().toUpperCase() !== 'RESET') {
    return res.status(400).json({ error: 'Debes escribir RESET para confirmar' });
  }

  const backup = createDatabaseBackup(db, {
    reason: 'pre-reset',
    maxFiles: Number(getFullConfig().backup_max_archivos || 14),
  });

  resetOperationalData(db);

  return res.json({
    ok: true,
    message: 'Se resetearon los datos operativos. Configuracion, menu, usuarios y personal se conservaron.',
    backup,
  });
});

router.post('/whatsapp/test', auth, requirePermission('config.manage'), async (req, res) => {
  const config = getFullConfig();
  const status = getWhatsAppStatus(config);
  const telefono = normalizeWhatsAppPhone(req.body?.telefono || config.whatsapp_test_destino || config.whatsapp_numero);
  const mensaje = (req.body?.mensaje || `Prueba de WhatsApp API desde ${config.negocio_nombre || 'Modo Sabor'}`).trim();

  if (!telefono) {
    return res.status(400).json({ error: 'Falta un telefono de destino para la prueba' });
  }

  if (!status.ready) {
    return res.status(400).json({ error: 'WhatsApp API no esta listo. Revisa token y Phone Number ID.' });
  }

  try {
    const result = await sendWhatsAppText({ config, to: telefono, body: mensaje });
    return res.json({
      ok: true,
      to: telefono,
      result,
      message: 'Mensaje de prueba enviado',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar el mensaje de prueba' });
  }
});

router.put('/', auth, requirePermission('config.manage'), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]), (req, res) => {
  const updates = { ...req.body };
  const logoFile = req.files?.logo?.[0];
  const faviconFile = req.files?.favicon?.[0];
  if (logoFile) updates.negocio_logo = `/uploads/${logoFile.filename}`;
  if (faviconFile) updates.negocio_favicon = `/uploads/${faviconFile.filename}`;
  if (updates.delivery_zonas) {
    try {
      updates.delivery_zonas = serializeZones(JSON.parse(updates.delivery_zonas));
    } catch {
      return res.status(400).json({ error: 'Las zonas de delivery tienen formato invalido' });
    }
  }
  const stmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)');
  Object.entries(updates).forEach(([k, v]) => stmt.run(k, v));
  res.json(getFullConfig());
});

module.exports = router;
