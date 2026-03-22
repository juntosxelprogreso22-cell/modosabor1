function clean(value) {
  return String(value || '').trim();
}

function cleanUrl(value) {
  return clean(value).replace(/\/$/, '');
}

function isLocalUrl(value) {
  return /localhost|127\.0\.0\.1/i.test(clean(value));
}

function deriveFrontendUrlFromApi(apiUrl) {
  const raw = cleanUrl(apiUrl);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes('-backend.')) {
      parsed.hostname = parsed.hostname.replace('-backend.', '-frontend.');
      return parsed.toString().replace(/\/$/, '');
    }
    if (parsed.hostname.startsWith('backend.')) {
      parsed.hostname = parsed.hostname.replace(/^backend\./, 'frontend.');
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {}

  return '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
}

function mergeRuntimeConfig(config = {}) {
  const env = process.env;
  const rawAppUrl = cleanUrl(firstNonEmpty(
    env.PUBLIC_APP_URL,
    env.FRONTEND_URL,
    env.APP_URL,
    config.public_app_url
  ));
  const rawApiUrl = cleanUrl(firstNonEmpty(
    env.PUBLIC_API_URL,
    env.BACKEND_URL,
    env.API_URL,
    env.RENDER_EXTERNAL_URL,
    config.public_api_url
  ));
  const derivedAppUrl = (!rawAppUrl || isLocalUrl(rawAppUrl)) ? deriveFrontendUrlFromApi(rawApiUrl) : '';
  const finalAppUrl = cleanUrl(derivedAppUrl || rawAppUrl);

  const merged = {
    ...config,
    public_app_url: finalAppUrl,
    public_api_url: rawApiUrl,
    whatsapp_modo_envio: firstNonEmpty(
      env.WHATSAPP_MODO_ENVIO,
      env.WHATSAPP_MODE,
      config.whatsapp_modo_envio
    ) || 'manual',
    whatsapp_api_provider: firstNonEmpty(
      env.WHATSAPP_API_PROVIDER,
      config.whatsapp_api_provider
    ) || 'meta',
    whatsapp_api_version: firstNonEmpty(
      env.WHATSAPP_API_VERSION,
      config.whatsapp_api_version
    ) || 'v23.0',
    whatsapp_api_token: firstNonEmpty(
      env.WHATSAPP_API_TOKEN,
      env.META_WHATSAPP_TOKEN,
      config.whatsapp_api_token
    ),
    whatsapp_phone_number_id: firstNonEmpty(
      env.WHATSAPP_PHONE_NUMBER_ID,
      env.META_WHATSAPP_PHONE_NUMBER_ID,
      config.whatsapp_phone_number_id
    ),
    whatsapp_webhook_verify_token: firstNonEmpty(
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      config.whatsapp_webhook_verify_token
    ) || 'modo-sabor-bot',
    whatsapp_bot_activo: firstNonEmpty(
      env.WHATSAPP_BOT_ACTIVO,
      config.whatsapp_bot_activo
    ) || '0',
    whatsapp_ai_activa: firstNonEmpty(
      env.WHATSAPP_AI_ACTIVA,
      config.whatsapp_ai_activa
    ) || '0',
    whatsapp_numero: firstNonEmpty(
      env.WHATSAPP_NUMERO,
      env.WHATSAPP_BUSINESS_NUMBER,
      config.whatsapp_numero
    ),
    whatsapp_test_destino: firstNonEmpty(
      env.WHATSAPP_TEST_DESTINO,
      config.whatsapp_test_destino
    ),
    openai_api_key: firstNonEmpty(
      env.OPENAI_API_KEY,
      config.openai_api_key
    ),
    whatsapp_ai_modelo: firstNonEmpty(
      env.OPENAI_MODEL,
      env.WHATSAPP_AI_MODELO,
      config.whatsapp_ai_modelo
    ) || 'gpt-5-mini',
  };

  return merged;
}

module.exports = {
  mergeRuntimeConfig,
};
