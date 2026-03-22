const DEFAULT_PROVIDER = 'meta';
const DEFAULT_API_VERSION = 'v23.0';

function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  return `54${digits}`;
}

function getWhatsAppConfig(config = {}) {
  return {
    mode: config.whatsapp_modo_envio || 'manual',
    provider: config.whatsapp_api_provider || DEFAULT_PROVIDER,
    apiVersion: config.whatsapp_api_version || DEFAULT_API_VERSION,
    token: config.whatsapp_api_token || '',
    phoneNumberId: config.whatsapp_phone_number_id || '',
  };
}

function getWhatsAppStatus(config = {}) {
  const waConfig = getWhatsAppConfig(config);
  const checks = {
    token: Boolean(waConfig.token),
    phone_number_id: Boolean(waConfig.phoneNumberId),
  };

  return {
    mode: waConfig.mode,
    provider: waConfig.provider,
    ready: waConfig.mode === 'api' ? Object.values(checks).every(Boolean) : false,
    checks,
  };
}

function buildMetaMessagesUrl({ apiVersion, phoneNumberId }) {
  return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
}

function buildWhatsAppApiError(data = {}) {
  const error = data?.error || {};
  const code = Number(error.code || data?.code || 0);
  const type = error.type || data?.type || '';
  const fbtraceId = error.fbtrace_id || data?.fbtrace_id || '';
  const hint = code === 131030
    ? 'Agrega y verifica el numero destino en Meta Developers > WhatsApp > API Setup > To antes de repetir la prueba.'
    : '';

  const message =
    code === 131030
      ? 'Meta rechazo el destino: el numero no esta en la lista permitida de pruebas. Agregalo en WhatsApp Cloud API > API Setup > To y volve a intentar.'
      :
    error.message ||
    data?.message ||
    'No se pudo enviar el mensaje por WhatsApp API';

  const finalMessage = code ? `${message} (code ${code})` : message;
  const builtError = new Error(finalMessage);
  builtError.code = code || null;
  builtError.type = type;
  builtError.fbtrace_id = fbtraceId;
  builtError.hint = hint;
  builtError.details = data;
  return builtError;
}

async function sendWhatsAppText({ config, to, body }) {
  const waConfig = getWhatsAppConfig(config);
  if (waConfig.mode !== 'api') {
    throw new Error('WhatsApp API no esta activado');
  }

  if (waConfig.provider !== 'meta') {
    throw new Error('Proveedor de WhatsApp no soportado');
  }

  if (!waConfig.token || !waConfig.phoneNumberId) {
    throw new Error('Falta configurar token o Phone Number ID de WhatsApp');
  }

  const response = await fetch(buildMetaMessagesUrl(waConfig), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${waConfig.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildWhatsAppApiError(data);
  }

  return data;
}

function logWhatsappDelivery(db, {
  pedidoId = null,
  tipo = '',
  telefono = '',
  mensaje = '',
  proveedor = 'manual',
  estado = 'pendiente',
  externoId = '',
  error = '',
  payload = {},
}) {
  return db.prepare(`
    INSERT INTO whatsapp_envios (
      pedido_id, tipo, telefono, mensaje, proveedor, estado, externo_id, error, payload, enviado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pedidoId,
    tipo,
    telefono,
    mensaje,
    proveedor,
    estado,
    externoId,
    error,
    JSON.stringify(payload || {}),
    estado === 'enviado' ? new Date().toISOString() : null
  );
}

module.exports = {
  normalizeWhatsAppPhone,
  getWhatsAppConfig,
  getWhatsAppStatus,
  buildWhatsAppApiError,
  sendWhatsAppText,
  logWhatsappDelivery,
};
