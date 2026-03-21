const { getConfigMap } = require('./mercadoPago');
const {
  normalizeWhatsAppPhone,
  getWhatsAppStatus,
  sendWhatsAppText,
  logWhatsappDelivery,
} = require('./whatsapp');
const { runOpenAIWhatsAppAgent } = require('./openaiWhatsAppAgent');

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return compactText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function applyTemplate(template, payload) {
  return String(template || '').replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const cleanKey = String(key || '').trim();
    return payload[cleanKey] ?? '';
  }).replace(/\s{2,}/g, ' ').trim();
}

function getPedidoUrl(config) {
  const explicit = String(config.whatsapp_bot_link_pedidos || '').trim();
  if (explicit) return explicit;
  return String(config.public_app_url || 'http://localhost:5173').replace(/\/$/, '');
}

function getTrackingUrl(config, pedidoId) {
  const base = String(config.public_app_url || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/seguimiento/${pedidoId}`;
}

function upsertConversation(db, telefono, nombre = '') {
  const existing = db.prepare('SELECT * FROM whatsapp_conversaciones WHERE telefono = ?').get(telefono);
  if (existing) {
    db.prepare(`
      UPDATE whatsapp_conversaciones
      SET nombre = CASE WHEN ? != '' THEN ? ELSE nombre END,
          actualizado_en = CURRENT_TIMESTAMP,
          ultimo_mensaje_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nombre, nombre, existing.id);
    return db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO whatsapp_conversaciones (
      telefono, nombre, ultimo_mensaje_en, actualizado_en
    ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(telefono, nombre);
  return db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(result.lastInsertRowid);
}

function appendConversationMessage(db, conversationId, telefono, direccion, contenido, payload, tipo = 'text') {
  db.prepare(`
    INSERT INTO whatsapp_mensajes (conversacion_id, telefono, direccion, tipo, contenido, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(conversationId, telefono, direccion, tipo, contenido, JSON.stringify(payload || {}));
}

function markConversation(db, conversationId, updates = {}) {
  const current = db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(conversationId);
  if (!current) return null;

  db.prepare(`
    UPDATE whatsapp_conversaciones
    SET ultimo_estado = ?,
        ultimo_contexto = ?,
        escalado_humano = ?,
        ultima_respuesta_en = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE ultima_respuesta_en END,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    updates.ultimo_estado ?? current.ultimo_estado,
    updates.ultimo_contexto ?? current.ultimo_contexto,
    updates.escalado_humano ?? current.escalado_humano,
    updates.setRespuesta ? 1 : 0,
    conversationId
  );

  return db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(conversationId);
}

function extractTextFromWebhook(value) {
  const messages = value?.messages || [];
  const contacts = value?.contacts || [];
  const contactName = contacts[0]?.profile?.name || '';

  return messages
    .filter((message) => message?.type === 'text' && message?.text?.body)
    .map((message) => ({
      whatsappMessageId: message.id || '',
      from: normalizeWhatsAppPhone(message.from || ''),
      name: contactName,
      text: compactText(message.text.body),
      raw: message,
    }))
    .filter((message) => message.from && message.text);
}

function getActiveCategories(db) {
  return db.prepare('SELECT * FROM categorias WHERE activo = 1 ORDER BY orden ASC, nombre ASC').all();
}

function getProductsByCategory(db, categoryId, limit = 4) {
  return db.prepare(`
    SELECT * FROM productos
    WHERE activo = 1 AND categoria_id = ?
    ORDER BY destacado DESC, nombre ASC
    LIMIT ?
  `).all(categoryId, limit);
}

function getFeaturedProducts(db, limit = 5) {
  return db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
    ORDER BY p.destacado DESC, p.nombre ASC
    LIMIT ?
  `).all(limit);
}

function findCategoryByMessage(db, text) {
  const normalized = normalizeText(text);
  const categories = getActiveCategories(db);
  return categories.find((category) => normalized.includes(normalizeText(category.nombre)));
}

function findProductByMessage(db, text) {
  const normalized = normalizeText(text);
  const products = db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
    ORDER BY p.destacado DESC, p.nombre ASC
  `).all();

  return products.find((product) => normalized.includes(normalizeText(product.nombre)));
}

function getOrderByNumberForPhone(db, numero, telefono) {
  const pedidos = db.prepare('SELECT * FROM pedidos WHERE numero = ? ORDER BY id DESC').all(numero);
  return pedidos.find((pedido) => normalizeWhatsAppPhone(pedido.cliente_telefono) === telefono) || null;
}

function buildCategoryReply(db, category) {
  const products = getProductsByCategory(db, category.id, 4);
  const lines = products.map((product) => `- ${product.nombre}: ${money(product.precio)}`);
  return compactText(`
    ${category.nombre} disponibles:
    ${lines.join('\n')}
    Si queres, decime el nombre del producto o pedi directo aca: ${getPedidoUrl(getConfigMap(db))}
  `);
}

function buildTrackingReply(config, pedido) {
  return compactText(`
    Tu pedido #${pedido.numero} esta ${pedido.estado.replace(/_/g, ' ')}.
    Total: ${money(pedido.total)}.
    Seguimiento: ${getTrackingUrl(config, pedido.id)}
  `);
}

function buildBotReply(db, conversation, incomingText, contactName = '') {
  const config = getConfigMap(db);
  const text = normalizeText(incomingText);
  const templateData = {
    cliente: contactName || conversation.nombre || 'cliente',
    negocio: config.negocio_nombre || 'Modo Sabor',
    pedido_url: getPedidoUrl(config),
  };

  if (!text) {
    return {
      reply: applyTemplate(config.whatsapp_bot_fallback, templateData),
      state: 'fallback',
      context: '',
      escalated: false,
    };
  }

  if (/(humano|persona|asesor|atencion|operador)/.test(text)) {
    return {
      reply: applyTemplate(config.whatsapp_bot_humano, templateData),
      state: 'humano',
      context: 'escalado',
      escalated: true,
    };
  }

  const trackingMatch = text.match(/(?:seguimiento|pedido|estado)\s*#?\s*(\d{1,6})/);
  if (trackingMatch) {
    const pedido = getOrderByNumberForPhone(db, Number(trackingMatch[1]), conversation.telefono);
    if (pedido) {
      return {
        reply: buildTrackingReply(config, pedido),
        state: 'seguimiento',
        context: `pedido:${pedido.id}`,
        escalated: false,
      };
    }
    return {
      reply: 'No encontre un pedido con ese numero para este WhatsApp. Si queres, escribime MENU o pasa el numero exacto.',
      state: 'seguimiento',
      context: 'pedido_no_encontrado',
      escalated: false,
    };
  }

  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|menu|carta|opciones)$/.test(text) || text.includes('menu')) {
    const categories = getActiveCategories(db).map((category) => `- ${category.nombre}`);
    const destacados = getFeaturedProducts(db, 4).map((product) => `${product.nombre} ${money(product.precio)}`);
    return {
      reply: compactText(`
        ${applyTemplate(config.whatsapp_bot_bienvenida, templateData)}
        Categorias:
        ${categories.join('\n')}
        Destacados: ${destacados.join(' | ')}.
        Tambien podes pedir directo aca: ${getPedidoUrl(config)}
      `),
      state: 'menu',
      context: 'menu_principal',
      escalated: false,
    };
  }

  if (/(pizzas|pizza)/.test(text)) {
    const category = findCategoryByMessage(db, 'pizzas');
    if (category) {
      return {
        reply: buildCategoryReply(db, category),
        state: 'categoria',
        context: 'pizzas',
        escalated: false,
      };
    }
  }

  if (/(empanadas|empanada)/.test(text)) {
    const category = findCategoryByMessage(db, 'empanadas');
    if (category) {
      return {
        reply: buildCategoryReply(db, category),
        state: 'categoria',
        context: 'empanadas',
        escalated: false,
      };
    }
  }

  if (/(milanesas|milanesa|mila)/.test(text)) {
    const category = findCategoryByMessage(db, 'milanesas');
    if (category) {
      return {
        reply: buildCategoryReply(db, category),
        state: 'categoria',
        context: 'milanesas',
        escalated: false,
      };
    }
  }

  if (/(delivery|envio|reparto)/.test(text)) {
    return {
      reply: compactText(`
        Hacemos delivery y retiro.
        El envio base hoy es ${money(config.costo_envio_base || 0)} y el tiempo estimado es ${config.tiempo_delivery || 30} min.
        Para pedir directo entra aca: ${getPedidoUrl(config)}
      `),
      state: 'delivery',
      context: 'delivery_info',
      escalated: false,
    };
  }

  if (/(lo de siempre|repeti|repetir ultimo|ultimo pedido)/.test(text)) {
    return {
      reply: compactText(`
        Si tenes la IA activa, puedo repetir tu ultimo pedido y editarlo desde este mismo chat.
        Si preferis, pedilo directo aca: ${getPedidoUrl(config)}
      `),
      state: 'recompra',
      context: 'repeat_last_order',
      escalated: false,
    };
  }

  if (/(pago|pagos|mercadopago|transferencia|modo|uala|efectivo)/.test(text)) {
    let metodos = [];
    try {
      metodos = JSON.parse(config.metodos_pago || '[]');
    } catch {
      metodos = ['efectivo', 'mercadopago', 'transferencia'];
    }
    return {
      reply: compactText(`
        Podes pagar con: ${metodos.join(', ')}.
        Si haces el pedido por la web, tambien vas a ver las opciones disponibles: ${getPedidoUrl(config)}
      `),
      state: 'pagos',
      context: 'metodos_pago',
      escalated: false,
    };
  }

  const product = findProductByMessage(db, incomingText);
  if (product) {
    return {
      reply: compactText(`
        ${product.nombre} sale ${money(product.precio)}.
        ${product.descripcion || ''}
        Si queres pedirlo, entra aca: ${getPedidoUrl(config)}
      `),
      state: 'producto',
      context: `producto:${product.id}`,
      escalated: false,
    };
  }

  return {
    reply: applyTemplate(config.whatsapp_bot_fallback, templateData),
    state: 'fallback',
    context: 'fallback',
    escalated: false,
  };
}

async function handleIncomingWhatsAppMessages(db, io, payload) {
  const config = getConfigMap(db);
  const status = getWhatsAppStatus(config);
  if (config.whatsapp_bot_activo !== '1') {
    return { processed: 0, ignored: true, reason: 'bot_inactivo' };
  }
  if (!status.ready) {
    return { processed: 0, ignored: true, reason: 'whatsapp_api_no_lista' };
  }

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  let processed = 0;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const incomingMessages = extractTextFromWebhook(value);

      for (const incoming of incomingMessages) {
        const conversation = upsertConversation(db, incoming.from, incoming.name);
        appendConversationMessage(
          db,
          conversation.id,
          incoming.from,
          'in',
          incoming.text,
          incoming.raw,
          incoming.raw?.type || 'text'
        );

        let botReply = null;
        try {
          botReply = await runOpenAIWhatsAppAgent({
            db,
            conversation,
            incomingText: incoming.text,
            onPedidoCreated: async (pedido) => {
              if (io) {
                io.emit('nuevo_pedido', pedido);
              }
            },
          });
        } catch (error) {
          console.error('WhatsApp AI fallback:', error.message || error);
        }

        if (!botReply) {
          botReply = buildBotReply(db, conversation, incoming.text, incoming.name);
        }

        await sendWhatsAppText({
          config,
          to: incoming.from,
          body: botReply.reply,
        });

        appendConversationMessage(
          db,
          conversation.id,
          incoming.from,
          'out',
          botReply.reply,
          { source: 'bot', state: botReply.state },
          'text'
        );

        logWhatsappDelivery(db, {
          pedidoId: null,
          tipo: botReply.state,
          telefono: incoming.from,
          mensaje: botReply.reply,
          proveedor: config.whatsapp_api_provider || 'meta',
          estado: 'enviado',
          payload: { source: 'bot' },
        });

        const updatedConversation = markConversation(db, conversation.id, {
          ultimo_estado: botReply.state,
          ultimo_contexto: botReply.context,
          escalado_humano: botReply.escalated ? 1 : 0,
          setRespuesta: true,
        });

        if (io) {
          io.emit('whatsapp_conversation_updated', {
            id: updatedConversation.id,
            telefono: updatedConversation.telefono,
            nombre: updatedConversation.nombre,
            ultimo_estado: updatedConversation.ultimo_estado,
            escalado_humano: updatedConversation.escalado_humano,
            actualizado_en: updatedConversation.actualizado_en,
          });
        }

        processed += 1;
      }
    }
  }

  return { processed, ignored: false };
}

module.exports = {
  handleIncomingWhatsAppMessages,
  upsertConversation,
  appendConversationMessage,
  markConversation,
};
