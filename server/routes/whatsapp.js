const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const {
  handleIncomingWhatsAppMessages,
  appendConversationMessage,
  markConversation,
} = require('../utils/whatsappBot');
const { getConfigMap } = require('../utils/mercadoPago');
const { sendWhatsAppText, logWhatsappDelivery, normalizeWhatsAppPhone } = require('../utils/whatsapp');
const { mergeRuntimeConfig } = require('../utils/runtimeConfig');

function getConfigValue(key) {
  return mergeRuntimeConfig(getConfigMap(db))[key] || '';
}

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = getConfigValue('whatsapp_webhook_verify_token');

  if (mode === 'subscribe' && token && token === expectedToken) {
    return res.status(200).send(challenge || 'ok');
  }

  return res.status(403).send('forbidden');
});

router.post('/webhook', async (req, res) => {
  try {
    await handleIncomingWhatsAppMessages(db, req.app.get('io'), req.body);
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
  }

  return res.status(200).json({ ok: true });
});

router.get('/conversaciones', auth, requirePermission('config.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM whatsapp_conversaciones
    ORDER BY datetime(actualizado_en) DESC, id DESC
    LIMIT 100
  `).all();
  res.json(rows);
});

router.get('/conversaciones/:id/mensajes', auth, requirePermission('config.manage'), (req, res) => {
  const mensajes = db.prepare(`
    SELECT *
    FROM whatsapp_mensajes
    WHERE conversacion_id = ?
    ORDER BY datetime(creado_en) ASC, id ASC
  `).all(req.params.id);
  res.json(mensajes);
});

router.post('/conversaciones/:id/responder', auth, requirePermission('config.manage'), async (req, res) => {
  const conversacion = db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(req.params.id);
  if (!conversacion) {
    return res.status(404).json({ error: 'Conversacion no encontrada' });
  }

  const contenido = String(req.body?.contenido || '').trim();
  if (!contenido) {
    return res.status(400).json({ error: 'Escribi un mensaje para responder' });
  }

  const config = mergeRuntimeConfig(getConfigMap(db));
  try {
    await sendWhatsAppText({
      config,
      to: normalizeWhatsAppPhone(conversacion.telefono),
      body: contenido,
    });

    appendConversationMessage(
      db,
      conversacion.id,
      conversacion.telefono,
      'out',
      contenido,
      { source: 'humano', actor: req.user?.nombre || 'Operador' },
      'text'
    );

    logWhatsappDelivery(db, {
      pedidoId: null,
      tipo: 'manual',
      telefono: conversacion.telefono,
      mensaje: contenido,
      proveedor: config.whatsapp_api_provider || 'meta',
      estado: 'enviado',
      payload: { source: 'humano', actor: req.user?.nombre || 'Operador' },
    });

    const updated = markConversation(db, conversacion.id, {
      ultimo_estado: 'humano',
      ultimo_contexto: 'respuesta_manual',
      escalado_humano: 1,
      setRespuesta: true,
    });

    req.app.get('io')?.emit('whatsapp_conversation_updated', {
      id: updated.id,
      telefono: updated.telefono,
      nombre: updated.nombre,
      ultimo_estado: updated.ultimo_estado,
      escalado_humano: updated.escalado_humano,
      actualizado_en: updated.actualizado_en,
    });

    return res.json({ ok: true, conversacion: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar la respuesta' });
  }
});

router.put('/conversaciones/:id/atendida', auth, requirePermission('config.manage'), (req, res) => {
  const conversacion = db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(req.params.id);
  if (!conversacion) {
    return res.status(404).json({ error: 'Conversacion no encontrada' });
  }

  const updated = markConversation(db, conversacion.id, {
    ultimo_estado: 'resuelta',
    ultimo_contexto: 'atendida_manual',
    escalado_humano: 0,
    setRespuesta: false,
  });

  req.app.get('io')?.emit('whatsapp_conversation_updated', {
    id: updated.id,
    telefono: updated.telefono,
    nombre: updated.nombre,
    ultimo_estado: updated.ultimo_estado,
    escalado_humano: updated.escalado_humano,
    actualizado_en: updated.actualizado_en,
  });

  return res.json(updated);
});

module.exports = router;
