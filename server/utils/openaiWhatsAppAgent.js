const { getConfigMap } = require('./mercadoPago');
const {
  getOrCreateDraft,
  getDraftWithItems,
  searchProducts,
  getFeaturedProducts,
  getProductOptionsDetail,
  addItemToDraft,
  addConfiguredItemToDraft,
  updateDraftMeta,
  clearDraft,
  removeDraftItem,
  updateDraftItemQuantity,
  getLastOrderForPhone,
  repeatLastOrderToDraft,
  confirmDraftAsPedido,
  summarizeDraft,
} = require('./orderDrafts');
const { normalizeWhatsAppPhone } = require('./whatsapp');

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildTrackingUrl(config, pedidoId) {
  const base = String(config.public_app_url || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/seguimiento/${pedidoId}`;
}

function getOrderByNumberForPhone(db, numero, telefono) {
  const pedidos = db.prepare('SELECT * FROM pedidos WHERE numero = ? ORDER BY id DESC').all(numero);
  return pedidos.find((pedido) => normalizeWhatsAppPhone(pedido.cliente_telefono) === telefono) || null;
}

function getTools() {
  return [
    { type: 'function', function: { name: 'search_products', description: 'Busca productos del menu por texto libre o categoria.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'recommend_products', description: 'Devuelve productos destacados del menu para recomendar.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'get_draft_order', description: 'Muestra el pedido borrador actual del cliente.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'get_product_options', description: 'Devuelve variantes, extras y sugerencias de sabores para un producto antes de agregarlo.', parameters: { type: 'object', properties: { product_id: { type: 'number' } }, required: ['product_id'] } } },
    { type: 'function', function: { name: 'add_item_to_draft', description: 'Agrega un producto al pedido borrador actual.', parameters: { type: 'object', properties: { product_id: { type: 'number' }, cantidad: { type: 'number' }, descripcion: { type: 'string' } }, required: ['product_id'] } } },
    {
      type: 'function',
      function: {
        name: 'add_configured_item_to_draft',
        description: 'Agrega un producto configurado con variantes, extras, sabores o mitades.',
        parameters: {
          type: 'object',
          properties: {
            product_id: { type: 'number' },
            cantidad: { type: 'number' },
            selected_options: { type: 'array', items: { type: 'object', properties: { group: { type: 'string' }, option: { type: 'string' } }, required: ['group', 'option'] } },
            extra_names: { type: 'array', items: { type: 'string' } },
            mitad_sabores: { type: 'array', items: { type: 'string' } },
            sabores: { type: 'array', items: { type: 'string' } },
            flavor_counts: { type: 'array', items: { type: 'object', properties: { sabor: { type: 'string' }, cantidad: { type: 'number' } }, required: ['sabor', 'cantidad'] } },
            nota: { type: 'string' },
          },
          required: ['product_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_order_details',
        description: 'Define entrega, direccion, nombre, metodo de pago o notas del pedido borrador.',
        parameters: {
          type: 'object',
          properties: {
            cliente_nombre: { type: 'string' },
            cliente_direccion: { type: 'string' },
            tipo_entrega: { type: 'string', enum: ['delivery', 'retiro'] },
            metodo_pago: { type: 'string' },
            notas: { type: 'string' },
          },
        },
      },
    },
    { type: 'function', function: { name: 'remove_item_from_draft', description: 'Elimina un item del borrador por su id.', parameters: { type: 'object', properties: { item_id: { type: 'number' } }, required: ['item_id'] } } },
    { type: 'function', function: { name: 'update_draft_item_quantity', description: 'Cambia la cantidad de un item del borrador actual. Si cantidad es 0, lo elimina.', parameters: { type: 'object', properties: { item_id: { type: 'number' }, match_text: { type: 'string' }, cantidad: { type: 'number' } }, required: ['cantidad'] } } },
    { type: 'function', function: { name: 'clear_draft_order', description: 'Vacia el borrador actual.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'get_last_order', description: 'Busca el ultimo pedido no cancelado del cliente para repetirlo o usarlo como referencia.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'repeat_last_order', description: 'Carga el ultimo pedido del cliente en el borrador actual para editarlo o confirmarlo.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'confirm_draft_order', description: 'Confirma el borrador y crea el pedido real en el sistema cuando ya tiene datos suficientes.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'get_order_status', description: 'Consulta el estado de un pedido existente por numero.', parameters: { type: 'object', properties: { numero: { type: 'number' } }, required: ['numero'] } } },
  ];
}

function buildSystemPrompt(config) {
  return compactText(`
    Sos el asistente de ventas de ${config.negocio_nombre || 'Modo Sabor'} por WhatsApp.
    Habla como una persona amable, breve y natural en espanol rioplatense.
    Nunca inventes productos, precios, estados ni metodos de pago.
    Para consultar menu, recomendaciones, borrador o confirmar pedidos, usa siempre herramientas.
    Si un producto puede tener tamano, presentacion, extras, mitades o sabores mixtos, primero usa get_product_options.
    Para empanadas por media docena o docena, si el cliente mezcla sabores, usa flavor_counts y asegurate de que sumen exactamente 6 o 12.
    Para pizzas por mitades, si el cliente pide mitad y mitad, usa mitad_sabores con exactamente 2 sabores.
    Entende abreviaciones comunes del cliente como muzza, napo, jyq, media doc, doc, grande, familiar, a caballo y con guarni.
    Cuando el cliente quiera delivery, pedi la direccion y usa set_order_details para recalcular envio, zona y demora reales.
    Si dice lo de siempre, repeti el ultimo o parecido, usa get_last_order o repeat_last_order.
    Si cambia de idea durante la charla, corregi el borrador usando update_draft_item_quantity, remove_item_from_draft o set_order_details.
    Antes de confirmar, asegurate de que el borrador tenga productos, entrega, direccion si aplica y forma de pago.
    Si falta informacion para cerrar el pedido, preguntala de forma clara una sola cosa por vez.
    Cuando el cliente quiera pedir, intenta ayudarlo a cerrar el pedido en este orden:
    productos, tipo de entrega, direccion si es delivery, metodo de pago y confirmacion.
    Si el cliente pide hablar con humano, respondelo sin herramientas y ofrece derivacion.
  `);
}

async function callOpenAIChat({ apiKey, model, messages, tools }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.35,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || 'No se pudo consultar OpenAI');
  }
  return data;
}

function toolResult(value) {
  return JSON.stringify(value, null, 2);
}

async function executeTool({ db, conversation, toolName, args, onPedidoCreated }) {
  const config = getConfigMap(db);
  const draft = getOrCreateDraft(db, {
    conversationId: conversation.id,
    telefono: conversation.telefono,
    clienteNombre: conversation.nombre || '',
  });

  switch (toolName) {
    case 'search_products':
      return {
        products: searchProducts(db, args.query, 6).map((product) => ({
          id: product.id,
          nombre: product.nombre,
          precio: Number(product.precio || 0),
          categoria: product.categoria_nombre || '',
          descripcion: product.descripcion || '',
        })),
      };
    case 'recommend_products':
      return {
        products: getFeaturedProducts(db, 5).map((product) => ({
          id: product.id,
          nombre: product.nombre,
          precio: Number(product.precio || 0),
          categoria: product.categoria_nombre || '',
          descripcion: product.descripcion || '',
        })),
      };
    case 'get_draft_order': {
      const hydrated = getDraftWithItems(db, draft.id);
      return {
        draft_id: hydrated.id,
        cliente_nombre: hydrated.cliente_nombre,
        cliente_direccion: hydrated.cliente_direccion,
        tipo_entrega: hydrated.tipo_entrega,
        metodo_pago: hydrated.metodo_pago,
        delivery_zona: hydrated.delivery_zona || '',
        tiempo_estimado_min: Number(hydrated.tiempo_estimado_min || 0),
        resumen: summarizeDraft(hydrated),
        items: hydrated.items.map((item) => ({
          id: item.id,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: Number(item.precio_unitario || 0),
          descripcion: item.descripcion || '',
        })),
      };
    }
    case 'get_product_options':
      return getProductOptionsDetail(db, Number(args.product_id));
    case 'add_item_to_draft': {
      const hydrated = addItemToDraft(db, {
        draftId: draft.id,
        productId: Number(args.product_id),
        cantidad: Number(args.cantidad || 1),
        descripcion: args.descripcion || '',
      });
      return { ok: true, resumen: summarizeDraft(hydrated) };
    }
    case 'add_configured_item_to_draft': {
      const hydrated = addConfiguredItemToDraft(db, {
        draftId: draft.id,
        productId: Number(args.product_id),
        cantidad: Number(args.cantidad || 1),
        selectedOptions: args.selected_options || [],
        extraNames: args.extra_names || [],
        mitadSabores: args.mitad_sabores || [],
        sabores: args.sabores || [],
        flavorCounts: args.flavor_counts || [],
        nota: args.nota || '',
      });
      return { ok: true, resumen: summarizeDraft(hydrated) };
    }
    case 'set_order_details': {
      const hydrated = updateDraftMeta(db, draft.id, {
        cliente_nombre: args.cliente_nombre,
        cliente_direccion: args.cliente_direccion,
        tipo_entrega: args.tipo_entrega,
        metodo_pago: args.metodo_pago,
        notas: args.notas,
      });
      return {
        ok: true,
        tipo_entrega: hydrated.tipo_entrega,
        metodo_pago: hydrated.metodo_pago,
        cliente_direccion: hydrated.cliente_direccion,
        delivery_zona: hydrated.delivery_zona || '',
        tiempo_estimado_min: Number(hydrated.tiempo_estimado_min || 0),
        resumen: summarizeDraft(hydrated),
      };
    }
    case 'remove_item_from_draft': {
      const hydrated = removeDraftItem(db, draft.id, Number(args.item_id));
      return { ok: true, resumen: summarizeDraft(hydrated) };
    }
    case 'update_draft_item_quantity': {
      const hydrated = updateDraftItemQuantity(db, draft.id, {
        itemId: args.item_id ? Number(args.item_id) : null,
        matchText: args.match_text || '',
        cantidad: Number(args.cantidad || 0),
      });
      return { ok: true, resumen: summarizeDraft(hydrated) };
    }
    case 'clear_draft_order': {
      const hydrated = clearDraft(db, draft.id);
      return { ok: true, resumen: summarizeDraft(hydrated) };
    }
    case 'get_last_order': {
      const pedido = getLastOrderForPhone(db, conversation.telefono);
      if (!pedido) return { found: false };
      return {
        found: true,
        numero: pedido.numero,
        total: Number(pedido.total || 0),
        tipo_entrega: pedido.tipo_entrega,
        metodo_pago: pedido.metodo_pago,
        direccion: pedido.cliente_direccion || '',
      };
    }
    case 'repeat_last_order': {
      const result = repeatLastOrderToDraft(db, {
        conversationId: conversation.id,
        telefono: conversation.telefono,
        clienteNombre: conversation.nombre || '',
      });
      return {
        ok: true,
        numero_original: result.pedidoAnterior.numero,
        resumen: summarizeDraft(result.borrador),
      };
    }
    case 'confirm_draft_order': {
      const pedido = confirmDraftAsPedido(db, draft.id, conversation.telefono);
      if (typeof onPedidoCreated === 'function') {
        await onPedidoCreated(pedido);
      }
      return {
        ok: true,
        pedido_id: pedido.id,
        numero: pedido.numero,
        total: Number(pedido.total || 0),
        seguimiento_url: buildTrackingUrl(config, pedido.id),
      };
    }
    case 'get_order_status': {
      const pedido = getOrderByNumberForPhone(db, Number(args.numero), conversation.telefono);
      if (!pedido) return { found: false };
      return {
        found: true,
        numero: pedido.numero,
        estado: pedido.estado,
        total: Number(pedido.total || 0),
        seguimiento_url: buildTrackingUrl(config, pedido.id),
      };
    }
    default:
      throw new Error('Herramienta no soportada');
  }
}

async function runOpenAIWhatsAppAgent({ db, conversation, incomingText, onPedidoCreated }) {
  const config = getConfigMap(db);
  if (config.whatsapp_ai_activa !== '1' || !config.openai_api_key) {
    return null;
  }

  const draft = getOrCreateDraft(db, {
    conversationId: conversation.id,
    telefono: conversation.telefono,
    clienteNombre: conversation.nombre || '',
  });

  const tools = getTools();
  const messages = [
    { role: 'system', content: buildSystemPrompt(config) },
    { role: 'system', content: `Estado actual del borrador:\n${summarizeDraft(getDraftWithItems(db, draft.id))}` },
    { role: 'user', content: incomingText },
  ];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const completion = await callOpenAIChat({
      apiKey: config.openai_api_key,
      model: config.whatsapp_ai_modelo || 'gpt-5-mini',
      messages,
      tools,
    });

    const choice = completion.choices?.[0]?.message;
    if (!choice) {
      throw new Error('Respuesta invalida de OpenAI');
    }

    if (!choice.tool_calls?.length) {
      return {
        reply: compactText(choice.content || ''),
        state: 'ia',
        context: 'ai_reply',
        escalated: /humano|persona|asesor/i.test(choice.content || '') ? true : false,
      };
    }

    messages.push(choice);

    for (const toolCall of choice.tool_calls) {
      const toolName = toolCall.function?.name;
      const args = JSON.parse(toolCall.function?.arguments || '{}');
      let result;
      try {
        result = await executeTool({ db, conversation, toolName, args, onPedidoCreated });
      } catch (error) {
        result = {
          ok: false,
          error: error.message || 'No se pudo ejecutar la herramienta',
          tool: toolName,
        };
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult(result),
      });
    }
  }

  throw new Error('La IA no pudo completar la respuesta');
}

module.exports = {
  runOpenAIWhatsAppAgent,
};
