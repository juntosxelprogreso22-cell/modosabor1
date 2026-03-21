function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value, symbol = '$') {
  return `${symbol}${Number(value || 0).toLocaleString('es-AR')}`;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseItems(items) {
  if (Array.isArray(items)) return items;
  return parseJson(items || '[]', []);
}

function absoluteAssetUrl(assetUrl, publicApiUrl) {
  const raw = String(assetUrl || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;

  const base = String(publicApiUrl || 'http://localhost:3001').trim().replace(/\/$/, '');
  if (!base) return raw;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

function configMap(db) {
  return db.prepare('SELECT * FROM configuracion').all().reduce((acc, row) => {
    acc[row.clave] = row.valor;
    return acc;
  }, {});
}

function itemDetailLines(item) {
  if (item.descripcion) {
    return String(item.descripcion)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        if (part.startsWith('Sabores:') && part.includes(',')) {
          const flavors = part.replace('Sabores:', '').split(',').map((entry) => entry.trim()).filter(Boolean);
          return ['Sabores:', ...flavors.map((entry) => `- ${entry}`)];
        }
        if (part.startsWith('Mitades:') && part.includes('/')) {
          const halves = part.replace('Mitades:', '').split('/').map((entry) => entry.trim()).filter(Boolean);
          return ['Mitades:', ...halves.map((entry) => `- ${entry}`)];
        }
        return [part];
      });
  }

  const lines = [];
  if (item.variantes && typeof item.variantes === 'object') {
    Object.entries(item.variantes).forEach(([key, value]) => {
      lines.push(`${key}: ${value?.nombre || value}`);
    });
  }
  if (Array.isArray(item.extras) && item.extras.length > 0) {
    lines.push(`Extras: ${item.extras.map((extra) => extra?.nombre).filter(Boolean).join(', ')}`);
  }
  return lines.filter(Boolean);
}

function baseStyles({ a6 = false, marginMm = 8, fontScale = 1 } = {}) {
  const scale = Number(fontScale || 1);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const titleSize = (a6 ? 18 : 24) * safeScale;
  const metaSize = (a6 ? 11 : 13) * safeScale;
  const grandSize = (a6 ? 13 : 15) * safeScale;
  return `
    <style>
      @page { size: ${a6 ? 'A6 portrait' : 'auto'}; margin: ${Number(marginMm || 8)}mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
      .sheet { width: 100%; max-width: ${a6 ? '105mm' : '720px'}; margin: 0 auto; }
      .head { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
      .logo-wrap { margin-bottom: 8px; display: flex; justify-content: center; }
      .logo-wrap img { display: block; max-width: ${a6 ? '54mm' : '72mm'}; max-height: ${a6 ? '20mm' : '28mm'}; object-fit: contain; }
      .title { font-size: ${titleSize}px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
      .meta, .row, .muted, .item-subline { font-size: ${metaSize}px; }
      .meta, .muted { color: #64748b; }
      .section { margin-top: 12px; }
      .section-label { font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
      .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; }
      .items { border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; padding: 8px 0; }
      .item { padding: 7px 0; border-bottom: 1px dashed #e2e8f0; }
      .item:last-child { border-bottom: 0; }
      .row { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; }
      .item-name { font-weight: 700; }
      .qty { min-width: 32px; font-weight: 800; display: inline-block; }
      .right { text-align: right; white-space: nowrap; }
      .item-subline { color: #475569; margin-top: 4px; padding-left: 32px; }
      .totals { margin-top: 8px; }
      .totals .row { padding: 3px 0; }
      .grand { border-top: 2px solid #111827; margin-top: 6px; padding-top: 8px; font-size: ${grandSize}px; font-weight: 800; }
      .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #f1f5f9; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .notes { margin-top: 8px; padding: 8px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 11px; }
      .footer { text-align: center; margin-top: 14px; font-size: 11px; color: #64748b; }
      .actions { margin-top: 16px; display: flex; justify-content: center; }
      .print-btn { border: 0; border-radius: 999px; padding: 10px 16px; background: #ea580c; color: #fff; font-weight: 700; cursor: pointer; }
      @media print { .actions { display: none; } body { background: #fff; } }
    </style>
  `;
}

function renderLogo(data) {
  const logoUrl = absoluteAssetUrl(data.logoUrl, data.publicApiUrl);
  if (!logoUrl) return '';
  return `<div class="logo-wrap"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(data.negocioNombre || 'Logo negocio')}" /></div>`;
}

function renderItems(items, symbol, withPrice) {
  return items.map((item) => {
    const details = itemDetailLines(item)
      .map((line) => `<div class="item-subline">${escapeHtml(line)}</div>`)
      .join('');

    return `
      <div class="item">
        <div class="row">
          <div class="item-name"><span class="qty">${escapeHtml(item.cantidad)}x</span>${escapeHtml(item.nombre)}</div>
          ${withPrice ? `<div class="right">${escapeHtml(money(Number(item.precio_unitario || 0) * Number(item.cantidad || 0), symbol))}</div>` : ''}
        </div>
        ${details}
      </div>
    `;
  }).join('');
}

function renderKitchenHtml(data) {
  const { pedido, negocioNombre, items } = data;
  const tipoEntrega = pedido.tipo_entrega === 'mesa'
    ? `Mesa ${pedido.mesa || '-'}`
    : pedido.tipo_entrega || 'pedido';

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Comanda #${escapeHtml(pedido.numero)}</title>
        ${baseStyles({ marginMm: data.marginMm, fontScale: data.fontScale })}
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            ${renderLogo(data)}
            <div class="title">${escapeHtml(negocioNombre)}</div>
            <div class="meta">Comanda de cocina</div>
          </div>
          <div class="row">
            <div class="badge">Pedido #${escapeHtml(pedido.numero)}</div>
            <div class="right muted">${escapeHtml(pedido.creado_en || '')}</div>
          </div>

          <div class="section">
            <div class="box">
              <div class="row"><div><strong>Tipo</strong></div><div class="right">${escapeHtml(tipoEntrega)}</div></div>
              ${pedido.cliente_nombre ? `<div class="row" style="margin-top:6px;"><div><strong>Cliente</strong></div><div class="right">${escapeHtml(pedido.cliente_nombre)}</div></div>` : ''}
              ${pedido.cliente_telefono ? `<div class="row" style="margin-top:6px;"><div><strong>Telefono</strong></div><div class="right">${escapeHtml(pedido.cliente_telefono)}</div></div>` : ''}
              ${pedido.tipo_entrega === 'delivery' && pedido.cliente_direccion ? `<div class="row" style="margin-top:6px;"><div><strong>Direccion</strong></div><div class="right">${escapeHtml(pedido.cliente_direccion)}</div></div>` : ''}
              ${pedido.tipo_entrega === 'delivery' && pedido.delivery_zona ? `<div class="row" style="margin-top:6px;"><div><strong>Zona</strong></div><div class="right">${escapeHtml(pedido.delivery_zona)}</div></div>` : ''}
              ${pedido.tipo_entrega === 'delivery' && Number(pedido.tiempo_estimado_min || 0) > 0 ? `<div class="row" style="margin-top:6px;"><div><strong>ETA</strong></div><div class="right">${escapeHtml(`${pedido.tiempo_estimado_min} min`)}</div></div>` : ''}
              ${pedido.turno_operativo ? `<div class="row" style="margin-top:6px;"><div><strong>Turno</strong></div><div class="right">${escapeHtml(pedido.turno_operativo)}</div></div>` : ''}
              ${pedido.tipo_entrega === 'delivery' && pedido.entrega_pin ? `<div class="row" style="margin-top:6px;"><div><strong>PIN entrega</strong></div><div class="right">${escapeHtml(pedido.entrega_pin)}</div></div>` : ''}
            </div>
          </div>

          <div class="section">
            <div class="section-label">Produccion</div>
            <div class="items">${renderItems(items, data.moneda, false)}</div>
          </div>

          ${pedido.notas ? `<div class="notes"><strong>Notas:</strong> ${escapeHtml(pedido.notas)}</div>` : ''}

          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>
        </div>
      </body>
    </html>
  `;
}

function renderTicketHtml(data) {
  const { pedido, negocioNombre, negocioDireccion, negocioTelefono, items, moneda, mensajeTicket, paymentLabel } = data;

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Ticket #${escapeHtml(pedido.numero)}</title>
        ${baseStyles({ a6: true, marginMm: data.marginMm, fontScale: data.fontScale })}
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            ${renderLogo(data)}
            <div class="title">${escapeHtml(negocioNombre)}</div>
            ${negocioDireccion ? `<div class="meta">${escapeHtml(negocioDireccion)}</div>` : ''}
            ${negocioTelefono ? `<div class="meta">${escapeHtml(negocioTelefono)}</div>` : ''}
          </div>
          <div class="row">
            <div><strong>Pedido #${escapeHtml(pedido.numero)}</strong></div>
            <div class="right muted">${escapeHtml(pedido.creado_en || '')}</div>
          </div>

          <div class="section">
            <div class="items">${renderItems(items, moneda, true)}</div>
          </div>

          <div class="totals">
            <div class="row"><div>Subtotal</div><div class="right">${escapeHtml(money(pedido.subtotal, moneda))}</div></div>
            ${Number(pedido.costo_envio || 0) > 0 ? `<div class="row"><div>Envio</div><div class="right">${escapeHtml(money(pedido.costo_envio, moneda))}</div></div>` : ''}
            ${Number(pedido.descuento || 0) > 0 ? `<div class="row"><div>Descuento</div><div class="right">-${escapeHtml(money(pedido.descuento, moneda))}</div></div>` : ''}
            <div class="row grand"><div>Total</div><div class="right">${escapeHtml(money(pedido.total, moneda))}</div></div>
          </div>

          <div class="section">
            <div class="row"><div>Pago</div><div class="right">${escapeHtml(paymentLabel)}</div></div>
            <div class="row" style="margin-top:6px;"><div>Entrega</div><div class="right">${escapeHtml(pedido.tipo_entrega || '')}${pedido.mesa ? ` / Mesa ${escapeHtml(pedido.mesa)}` : ''}</div></div>
            ${pedido.tipo_entrega === 'delivery' && pedido.delivery_zona ? `<div class="row" style="margin-top:6px;"><div>Zona</div><div class="right">${escapeHtml(pedido.delivery_zona)}</div></div>` : ''}
            ${pedido.tipo_entrega === 'delivery' && Number(pedido.tiempo_estimado_min || 0) > 0 ? `<div class="row" style="margin-top:6px;"><div>ETA</div><div class="right">${escapeHtml(`${pedido.tiempo_estimado_min} min`)}</div></div>` : ''}
            ${pedido.turno_operativo ? `<div class="row" style="margin-top:6px;"><div>Turno</div><div class="right">${escapeHtml(pedido.turno_operativo)}</div></div>` : ''}
            ${pedido.tipo_entrega === 'delivery' && pedido.entrega_pin ? `<div class="row" style="margin-top:6px;"><div>PIN</div><div class="right">${escapeHtml(pedido.entrega_pin)}</div></div>` : ''}
          </div>

          <div class="footer">${escapeHtml(mensajeTicket)}</div>
          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>
        </div>
      </body>
    </html>
  `;
}

function renderMesaPrecuentaHtml(data) {
  const { mesa, pedidos, negocioNombre, negocioDireccion, negocioTelefono, moneda, totalMesa } = data;

  const bloques = pedidos.map((pedido) => {
    const items = parseItems(pedido.items);
    return `
      <div class="section">
        <div class="row">
          <div><strong>Pedido #${escapeHtml(pedido.numero)}</strong></div>
          <div class="right muted">${escapeHtml(pedido.creado_en || '')}</div>
        </div>
        <div class="items">${renderItems(items, moneda, true)}</div>
        <div class="totals">
          <div class="row"><div>Subtotal</div><div class="right">${escapeHtml(money(pedido.subtotal, moneda))}</div></div>
          ${Number(pedido.descuento || 0) > 0 ? `<div class="row"><div>Descuento</div><div class="right">-${escapeHtml(money(pedido.descuento, moneda))}</div></div>` : ''}
          <div class="row"><div>Total pedido</div><div class="right"><strong>${escapeHtml(money(pedido.total, moneda))}</strong></div></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Precuenta Mesa ${escapeHtml(mesa)}</title>
        ${baseStyles({ a6: true, marginMm: data.marginMm, fontScale: data.fontScale })}
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            ${renderLogo(data)}
            <div class="title">${escapeHtml(negocioNombre)}</div>
            ${negocioDireccion ? `<div class="meta">${escapeHtml(negocioDireccion)}</div>` : ''}
            ${negocioTelefono ? `<div class="meta">${escapeHtml(negocioTelefono)}</div>` : ''}
          </div>
          <div class="row">
            <div><strong>Precuenta mesa ${escapeHtml(mesa)}</strong></div>
            <div class="right muted">${escapeHtml(new Date().toLocaleString('es-AR'))}</div>
          </div>

          ${bloques}

          <div class="totals">
            <div class="row grand"><div>Total mesa</div><div class="right">${escapeHtml(money(totalMesa, moneda))}</div></div>
          </div>

          <div class="footer">Documento no fiscal - resumen de consumo de salon</div>
          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>
        </div>
      </body>
    </html>
  `;
}

function buildPrintDocument(db, pedido, tipo) {
  const config = configMap(db);
  const items = parseItems(pedido.items);
  const paymentLabel = pedido.metodo_pago === 'mercadopago' ? 'MercadoPago' : pedido.metodo_pago;

  const data = {
    pedido,
    config,
    items,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    mensajeTicket: config.impresion_mensaje_ticket || 'Gracias por elegirnos',
    paymentLabel,
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || 'http://localhost:3001',
  };

  if (tipo === 'comanda_cocina') {
    return {
      tipo,
      area: 'cocina',
      payload: data,
      html: renderKitchenHtml(data),
    };
  }

  return {
    tipo: 'ticket_cliente',
    area: 'caja',
    payload: data,
    html: renderTicketHtml(data),
  };
}

function buildMesaPrecuentaDocument(db, mesa, pedidos) {
  const config = configMap(db);
  const totalMesa = pedidos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0);
  const data = {
    mesa,
    pedidos,
    totalMesa,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || 'http://localhost:3001',
  };

  return {
    tipo: 'precuenta_mesa',
    area: 'caja',
    payload: data,
    html: renderMesaPrecuentaHtml(data),
  };
}

function buildPrintTestDocument(db) {
  const config = configMap(db);
  const data = {
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || 'http://localhost:3001',
  };

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Prueba A6</title>
        ${baseStyles({ a6: true, marginMm: data.marginMm, fontScale: data.fontScale })}
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            ${renderLogo(data)}
            <div class="title">${escapeHtml(data.negocioNombre)}</div>
            <div class="meta">Prueba de impresion A6</div>
          </div>
          <div class="box">
            <div class="row"><div><strong>Formato</strong></div><div class="right">A6</div></div>
            <div class="row" style="margin-top:6px;"><div><strong>Margen</strong></div><div class="right">${escapeHtml(String(data.marginMm))} mm</div></div>
            <div class="row" style="margin-top:6px;"><div><strong>Escala</strong></div><div class="right">${escapeHtml(String(data.fontScale))}x</div></div>
          </div>
          <div class="section">
            <div class="section-label">Chequeo visual</div>
            <div class="items">
              <div class="item">
                <div class="row"><div class="item-name"><span class="qty">1x</span>Pizza Especial</div><div class="right">$12.000</div></div>
                <div class="item-subline">Mitades:</div>
                <div class="item-subline">- Muzzarella</div>
                <div class="item-subline">- Napolitana</div>
              </div>
              <div class="item">
                <div class="row"><div class="item-name"><span class="qty">1x</span>Empanadas surtidas</div><div class="right">$8.500</div></div>
                <div class="item-subline">Sabores:</div>
                <div class="item-subline">- 2 Carne</div>
                <div class="item-subline">- 2 Pollo</div>
                <div class="item-subline">- 2 JyQ</div>
              </div>
            </div>
          </div>
          <div class="notes">Si ves texto cortado, ajusta margen o escala desde configuracion.</div>
          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir prueba</button></div>
        </div>
      </body>
    </html>
  `;

  return {
    tipo: 'prueba_a6',
    area: 'configuracion',
    payload: data,
    html,
  };
}

module.exports = {
  buildPrintDocument,
  buildMesaPrecuentaDocument,
  buildPrintTestDocument,
};
