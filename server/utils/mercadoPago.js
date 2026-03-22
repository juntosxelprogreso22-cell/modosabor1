const { mergeRuntimeConfig } = require('./runtimeConfig');

function getConfigMap(db) {
  const rows = db.prepare('SELECT clave, valor FROM configuracion').all();
  const config = rows.reduce((acc, row) => {
    acc[row.clave] = row.valor;
    return acc;
  }, {});
  return mergeRuntimeConfig(config);
}

async function mpRequest(path, token, options = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.error || 'Error en MercadoPago';
    throw new Error(message);
  }
  return data;
}

async function createPreference({ token, body, idempotencyKey = '' }) {
  return mpRequest('/checkout/preferences', token, {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(body),
  });
}

async function getPayment({ token, paymentId }) {
  return mpRequest(`/v1/payments/${paymentId}`, token, {
    method: 'GET',
  });
}

async function searchPayments({ token, externalReference, limit = 10 }) {
  const query = new URLSearchParams({
    external_reference: String(externalReference),
    sort: 'date_created',
    criteria: 'desc',
    limit: String(limit),
  });
  return mpRequest(`/v1/payments/search?${query.toString()}`, token, {
    method: 'GET',
  });
}

async function getMe({ token }) {
  return mpRequest('/users/me', token, {
    method: 'GET',
  });
}

module.exports = {
  getConfigMap,
  createPreference,
  getPayment,
  searchPayments,
  getMe,
};
