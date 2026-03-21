const { getConfigMap } = require('./mercadoPago');
const { quoteDelivery } = require('./deliveryZones');

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const TERM_ALIASES = [
  ['muzza', ['muzza', 'muzzarella', 'muzzarela', 'mozzarella', 'mozza', 'muzarela']],
  ['napolitana', ['napo', 'napolitana']],
  ['jamon y queso', ['jyq', 'jamon y queso', 'jamon queso', 'jamon/queso']],
  ['fugazzeta', ['fugazza', 'fugazzeta']],
  ['cuatro quesos', ['4 quesos', 'cuatro quesos']],
  ['a caballo', ['caballo', 'a caballo']],
  ['con guarnicion', ['con guarnicion', 'con guarni', 'guarnicion', 'con fritas']],
  ['media docena', ['media doc', 'media docena', '1/2 docena', 'media']],
  ['docena', ['doc', 'docena', '12']],
  ['unidad', ['unidad', 'una', '1 unidad']],
  ['grande', ['grande', 'gran', 'gde']],
  ['familiar', ['familiar', 'fam']],
  ['chica', ['chica', 'chico']],
];

function expandAliasTerms(value) {
  const normalized = normalizeText(value);
  const terms = new Set([normalized]);
  TERM_ALIASES.forEach(([canonical, aliases]) => {
    const normalizedCanonical = normalizeText(canonical);
    const normalizedAliases = aliases.map((alias) => normalizeText(alias));
    if (normalizedAliases.includes(normalized) || normalizedCanonical === normalized) {
      terms.add(normalizedCanonical);
      normalizedAliases.forEach((alias) => terms.add(alias));
    }
    if (normalizedAliases.some((alias) => normalized.includes(alias)) || normalized.includes(normalizedCanonical)) {
      terms.add(normalizedCanonical);
      normalizedAliases.forEach((alias) => terms.add(alias));
    }
  });
  return Array.from(terms);
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getProductWithCategory(db, productId) {
  return db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.id = ? AND p.activo = 1
  `).get(productId);
}

function getFlavorSuggestions(db, product) {
  if (!product?.categoria_id) return [];
  const category = normalizeText(product.categoria_nombre || '');
  if (!category.includes('pizza') && !category.includes('empanada')) {
    return [];
  }

  return db.prepare(`
    SELECT id, nombre, precio
    FROM productos
    WHERE activo = 1 AND categoria_id = ? AND id != ?
    ORDER BY destacado DESC, nombre ASC
    LIMIT 12
  `).all(product.categoria_id, product.id).map((item) => ({
    ...item,
    aliases: expandAliasTerms(item.nombre).filter((alias) => alias !== normalizeText(item.nombre)),
  }));
}

function getProductOptionsDetail(db, productId) {
  const product = getProductWithCategory(db, productId);
  if (!product) throw new Error('Producto no encontrado');

  const variantGroups = parseJsonArray(product.variantes).map((group) => ({
    nombre: group?.nombre || '',
    opciones: parseJsonArray(group?.opciones).map((option) => ({
      nombre: option?.nombre || '',
      precio_extra: Number(option?.precio_extra || 0),
    })),
  }));

  const extras = parseJsonArray(product.extras).map((extra) => ({
    nombre: extra?.nombre || '',
    precio: Number(extra?.precio || 0),
  }));

  return {
    id: product.id,
    nombre: product.nombre,
    precio: Number(product.precio || 0),
    categoria: product.categoria_nombre || '',
    descripcion: product.descripcion || '',
    variant_groups: variantGroups,
    extras,
    sugerencias_sabores: getFlavorSuggestions(db, product),
    order_rules: getOrderRules(product, variantGroups),
  };
}

function getPresentationCount(selectedVariants) {
  const values = Object.values(selectedVariants || {}).map((option) => normalizeText(option?.nombre || ''));
  if (values.some((value) => value.includes('media docena'))) return 6;
  if (values.some((value) => value.includes('docena'))) return 12;
  if (values.some((value) => value.includes('unidad'))) return 1;
  return null;
}

function getOrderRules(product, variantGroups = []) {
  const type = detectProductType(product);
  const optionNames = variantGroups.flatMap((group) =>
    parseJsonArray(group?.opciones).map((option) => normalizeText(option?.nombre || ''))
  );

  return {
    type,
    allows_halves: type === 'pizza',
    supports_flavor_mix: type === 'empanada',
    available_presentations: optionNames.filter((name) =>
      name.includes('unidad') || name.includes('media docena') || name.includes('docena')
    ),
  };
}

function matchVariantSelection(group, selectedOptionName) {
  const normalizedOptionName = normalizeText(selectedOptionName);
  return parseJsonArray(group?.opciones).find((option) => {
    const optionTerms = expandAliasTerms(option?.nombre || '');
    return optionTerms.includes(normalizedOptionName) || optionTerms.some((term) => normalizedOptionName.includes(term));
  }) || null;
}

function matchExtraSelection(extras, name) {
  const normalizedName = normalizeText(name);
  return extras.find((extra) => {
    const extraTerms = expandAliasTerms(extra?.nombre || '');
    return extraTerms.includes(normalizedName) || extraTerms.some((term) => normalizedName.includes(term));
  }) || null;
}

function detectProductType(product) {
  const category = normalizeText(product.categoria_nombre || '');
  const name = normalizeText(product.nombre || '');
  if (category.includes('pizza') || name.includes('pizza')) return 'pizza';
  if (category.includes('empanada') || name.includes('empanada')) return 'empanada';
  if (category.includes('milanesa') || name.includes('mila')) return 'milanesa';
  return 'general';
}

function lookupProductsByNames(db, categoryId, names = []) {
  const all = db.prepare(`
    SELECT id, nombre, precio
    FROM productos
    WHERE activo = 1 AND categoria_id = ?
  `).all(categoryId);

  return names
    .map((name) => {
      const searchTerms = expandAliasTerms(name);
      return all.find((product) => {
        const productTerms = expandAliasTerms(product.nombre);
        return searchTerms.some((term) => productTerms.includes(term));
      })
        || all.find((product) => {
          const productName = normalizeText(product.nombre);
          return searchTerms.some((term) => productName.includes(term));
        })
        || null;
    })
    .filter(Boolean);
}

function searchProductsByAlias(db, query, limit = 6) {
  const searchTerms = expandAliasTerms(query);
  const all = db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
    ORDER BY p.destacado DESC, p.nombre ASC
  `).all();

  return all
    .filter((product) => {
      const haystack = [
        ...expandAliasTerms(product.nombre),
        normalizeText(product.descripcion || ''),
        normalizeText(product.categoria_nombre || ''),
      ];
      return searchTerms.some((term) => haystack.some((entry) => entry.includes(term) || term.includes(entry)));
    })
    .slice(0, limit);
}

function buildConfiguredDescription({
  product,
  selectedVariants,
  selectedExtras,
  mitadSabores,
  sabores,
  flavorCounts,
  nota,
}) {
  const parts = [];

  Object.entries(selectedVariants || {}).forEach(([groupName, option]) => {
    if (option?.nombre) {
      parts.push(`${groupName}: ${option.nombre}`);
    }
  });

  if (Array.isArray(mitadSabores) && mitadSabores.length >= 2) {
    parts.push(`Mitades: ${mitadSabores.join(' / ')}`);
  }

  if (Array.isArray(flavorCounts) && flavorCounts.length > 0) {
    parts.push(`Sabores: ${flavorCounts.map((item) => `${item.cantidad} ${item.sabor}`).join(', ')}`);
  } else if (Array.isArray(sabores) && sabores.length > 0) {
    parts.push(`Sabores: ${sabores.join(', ')}`);
  }

  if (Array.isArray(selectedExtras) && selectedExtras.length > 0) {
    parts.push(`Extras: ${selectedExtras.map((extra) => extra.nombre).join(', ')}`);
  }

  if (nota) {
    parts.push(`Nota: ${nota}`);
  }

  return parts.join(' | ');
}

function configuredItemName(product, mitadSabores, sabores, selectedVariants, flavorCounts) {
  const type = detectProductType(product);
  const variantValues = Object.values(selectedVariants || {}).map((option) => option?.nombre).filter(Boolean);
  const normalizedVariants = variantValues.map((value) => normalizeText(value));

  if (type === 'pizza' && Array.isArray(mitadSabores) && mitadSabores.length >= 2) {
    return 'Pizza mitad y mitad';
  }

  const hasPackVariant = normalizedVariants.some((value) => value.includes('docena') || value.includes('media'));
  if (type === 'empanada' && ((Array.isArray(sabores) && sabores.length > 1) || (Array.isArray(flavorCounts) && flavorCounts.length > 1)) && hasPackVariant) {
    return 'Empanadas surtidas';
  }

  return product.nombre;
}

function computeConfiguredPrice(db, product, selectedVariants, selectedExtras, mitadSabores) {
  let basePrice = Number(product.precio || 0);

  if (Array.isArray(mitadSabores) && mitadSabores.length > 1 && product.categoria_id) {
    const related = lookupProductsByNames(db, product.categoria_id, mitadSabores);
    if (related.length) {
      basePrice = Math.max(basePrice, ...related.map((item) => Number(item.precio || 0)));
    }
  }

  const variantsTotal = Object.values(selectedVariants || {}).reduce(
    (acc, option) => acc + Number(option?.precio_extra || 0),
    0
  );
  const extrasTotal = (selectedExtras || []).reduce(
    (acc, extra) => acc + Number(extra?.precio || 0),
    0
  );

  return basePrice + variantsTotal + extrasTotal;
}

function resolveFlavorNames(db, product, names = []) {
  if (!product?.categoria_id) {
    return names.map((name) => String(name || '').trim()).filter(Boolean);
  }

  const matched = lookupProductsByNames(db, product.categoria_id, names);
  if (!matched.length) {
    return names.map((name) => String(name || '').trim()).filter(Boolean);
  }

  return matched.map((item) => item.nombre);
}

function normalizeFlavorCounts(db, product, flavorCounts = [], sabores = []) {
  const fromCounts = parseJsonArray(flavorCounts)
    .map((entry) => ({
      sabor: String(entry?.sabor || entry?.nombre || '').trim(),
      cantidad: Math.max(0, Number(entry?.cantidad || 0)),
    }))
    .filter((entry) => entry.sabor && entry.cantidad > 0);

  if (fromCounts.length > 0) {
    return fromCounts.map((entry) => {
      const resolved = resolveFlavorNames(db, product, [entry.sabor])[0] || entry.sabor;
      return { ...entry, sabor: resolved };
    });
  }

  return resolveFlavorNames(db, product, parseJsonArray(sabores))
    .map((name) => ({ sabor: String(name || '').trim(), cantidad: 1 }))
    .filter((entry) => entry.sabor);
}

function validateConfiguredSelection(product, selectedVariants, mitadSabores, flavorCounts) {
  const type = detectProductType(product);
  const requiredFlavorCount = getPresentationCount(selectedVariants);

  if (type === 'pizza') {
    if (Array.isArray(mitadSabores) && mitadSabores.length === 1) {
      throw new Error('Para pizza por mitades hacen falta 2 sabores');
    }
    if (Array.isArray(mitadSabores) && mitadSabores.length > 0 && mitadSabores.length !== 2) {
      throw new Error('La pizza por mitades debe tener exactamente 2 sabores');
    }
  }

  if (type === 'empanada' && requiredFlavorCount) {
    const totalRequested = flavorCounts.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    if (totalRequested === 0) {
      throw new Error(`Faltan definir los sabores para completar ${requiredFlavorCount} empanadas`);
    }
    if (totalRequested !== requiredFlavorCount) {
      throw new Error(`La seleccion debe sumar ${requiredFlavorCount} empanadas y hoy suma ${totalRequested}`);
    }
  }
}

function getNextNumero(db) {
  const config = db.prepare("SELECT valor FROM configuracion WHERE clave = 'numero_pedido_actual'").get();
  const num = parseInt(config?.valor || '1', 10);
  db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('numero_pedido_actual', ?)").run(String(num + 1));
  return num;
}

function ensureCliente(db, { nombre = '', telefono = '', direccion = '' }) {
  if (!telefono) return null;
  const existing = db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(telefono);
  if (existing) {
    db.prepare('UPDATE clientes SET nombre = ?, direccion = ? WHERE id = ?').run(nombre || '', direccion || '', existing.id);
    return existing.id;
  }
  if (!nombre) return null;
  const result = db.prepare('INSERT INTO clientes (nombre, telefono, direccion) VALUES (?, ?, ?)').run(nombre, telefono, direccion || '');
  return result.lastInsertRowid;
}

function recalcDraft(db, draftId) {
  const draft = db.prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?').get(draftId);
  if (!draft) return null;

  const items = db.prepare('SELECT * FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ? ORDER BY id ASC').all(draftId);
  const subtotal = items.reduce((acc, item) => acc + Number(item.precio_unitario || 0) * Number(item.cantidad || 0), 0);
  const config = getConfigMap(db);
  let costoEnvio = 0;
  let deliveryZona = '';
  let tiempoEstimadoMin = 0;

  if (draft.tipo_entrega === 'delivery') {
    const quote = quoteDelivery(config, draft.cliente_direccion || '');
    if (quote.available || quote.pending) {
      costoEnvio = Number(quote.costo_envio || 0);
      deliveryZona = quote.zone_name || '';
      tiempoEstimadoMin = Number(quote.tiempo_estimado_min || config.tiempo_delivery || 30);
    }
  } else if (draft.tipo_entrega === 'retiro') {
    tiempoEstimadoMin = Number(config.tiempo_retiro || 20);
  }
  const total = subtotal + costoEnvio;

  db.prepare(`
    UPDATE whatsapp_pedidos_borrador
    SET subtotal = ?, costo_envio = ?, total = ?, delivery_zona = ?, tiempo_estimado_min = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(subtotal, costoEnvio, total, deliveryZona, tiempoEstimadoMin, draftId);

  return db.prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?').get(draftId);
}

function getOpenDraft(db, conversationId) {
  return db.prepare(`
    SELECT *
    FROM whatsapp_pedidos_borrador
    WHERE conversacion_id = ? AND estado = 'abierto'
    ORDER BY id DESC
    LIMIT 1
  `).get(conversationId);
}

function getOrCreateDraft(db, { conversationId, telefono, clienteNombre = '' }) {
  const existing = getOpenDraft(db, conversationId);
  if (existing) return recalcDraft(db, existing.id);

  const result = db.prepare(`
    INSERT INTO whatsapp_pedidos_borrador (
      conversacion_id, telefono, cliente_nombre, tipo_entrega, estado, subtotal, costo_envio, total, delivery_zona, tiempo_estimado_min
    ) VALUES (?, ?, ?, 'delivery', 'abierto', 0, 0, 0, '', 0)
  `).run(conversationId, telefono, clienteNombre || '');

  return recalcDraft(db, result.lastInsertRowid);
}

function getDraftWithItems(db, draftId) {
  const draft = db.prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?').get(draftId);
  if (!draft) return null;
  const items = db.prepare(`
    SELECT *
    FROM whatsapp_pedidos_borrador_items
    WHERE borrador_id = ?
    ORDER BY id ASC
  `).all(draftId);
  return { ...draft, items };
}

function searchProducts(db, query, limit = 6) {
  const normalizedQuery = `%${String(query || '').trim()}%`;
  const direct = db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
      AND (
        p.nombre LIKE ?
        OR p.descripcion LIKE ?
        OR c.nombre LIKE ?
    )
    ORDER BY p.destacado DESC, p.nombre ASC
    LIMIT ?
  `).all(normalizedQuery, normalizedQuery, normalizedQuery, limit);

  if (direct.length > 0) return direct;
  return searchProductsByAlias(db, query, limit);
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

function addItemToDraft(db, { draftId, productId, cantidad = 1, descripcion = '', variantes = {}, extras = [] }) {
  const product = getProductWithCategory(db, productId);
  if (!product) throw new Error('Producto no encontrado');

  const normalizedQty = Math.max(1, Number(cantidad || 1));
  const extrasTotal = Array.isArray(extras)
    ? extras.reduce((acc, item) => acc + Number(item?.precio || 0), 0)
    : 0;
  const precioUnitario = Number(product.precio || 0) + extrasTotal;

  db.prepare(`
    INSERT INTO whatsapp_pedidos_borrador_items (
      borrador_id, producto_id, nombre, cantidad, precio_unitario, descripcion, variantes, extras
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    draftId,
    product.id,
    product.nombre,
    normalizedQty,
    precioUnitario,
    descripcion || '',
    JSON.stringify(variantes || {}),
    JSON.stringify(extras || [])
  );

  recalcDraft(db, draftId);
  return getDraftWithItems(db, draftId);
}

function addConfiguredItemToDraft(
  db,
  {
    draftId,
    productId,
    cantidad = 1,
    selectedOptions = [],
    extraNames = [],
    mitadSabores = [],
    sabores = [],
    flavorCounts = [],
    nota = '',
  }
) {
  const product = getProductWithCategory(db, productId);
  if (!product) throw new Error('Producto no encontrado');

  const optionGroups = parseJsonArray(product.variantes);
  const extrasCatalog = parseJsonArray(product.extras);

  const selectedVariants = {};
  parseJsonArray(selectedOptions).forEach((entry) => {
    const groupName = String(entry?.group || '').trim();
    const optionName = String(entry?.option || '').trim();
    if (!groupName || !optionName) return;

    const group = optionGroups.find((item) => normalizeText(item?.nombre) === normalizeText(groupName));
    if (!group) return;
    const option = matchVariantSelection(group, optionName);
    if (!option) return;
    selectedVariants[group.nombre] = {
      nombre: option.nombre,
      precio_extra: Number(option.precio_extra || 0),
    };
  });

  const selectedExtras = parseJsonArray(extraNames)
    .map((name) => matchExtraSelection(extrasCatalog, name))
    .filter(Boolean)
    .map((extra) => ({
      nombre: extra.nombre,
      precio: Number(extra.precio || 0),
    }));

  const normalizedQty = Math.max(1, Number(cantidad || 1));
  const rawMitades = parseJsonArray(mitadSabores).map((item) => String(item || '').trim()).filter(Boolean);
  const normalizedMitades = resolveFlavorNames(db, product, rawMitades);
  const normalizedSabores = parseJsonArray(sabores).map((item) => String(item || '').trim()).filter(Boolean);
  const normalizedFlavorCounts = normalizeFlavorCounts(db, product, flavorCounts, normalizedSabores);
  validateConfiguredSelection(product, selectedVariants, normalizedMitades, normalizedFlavorCounts);

  const description = buildConfiguredDescription({
    product,
    selectedVariants,
    selectedExtras,
    mitadSabores: normalizedMitades,
    sabores: normalizedSabores,
    flavorCounts: normalizedFlavorCounts,
    nota: nota || '',
  });
  const precioUnitario = computeConfiguredPrice(
    db,
    product,
    selectedVariants,
    selectedExtras,
    normalizedMitades
  );
  const itemName = configuredItemName(product, normalizedMitades, normalizedSabores, selectedVariants, normalizedFlavorCounts);

  db.prepare(`
    INSERT INTO whatsapp_pedidos_borrador_items (
      borrador_id, producto_id, nombre, cantidad, precio_unitario, descripcion, variantes, extras
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    draftId,
    product.id,
    itemName,
    normalizedQty,
    precioUnitario,
    description,
    JSON.stringify(selectedVariants),
    JSON.stringify(selectedExtras)
  );

  recalcDraft(db, draftId);
  return getDraftWithItems(db, draftId);
}

function updateDraftMeta(db, draftId, updates = {}) {
  const current = db.prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?').get(draftId);
  if (!current) throw new Error('Borrador no encontrado');

  db.prepare(`
    UPDATE whatsapp_pedidos_borrador
    SET cliente_nombre = ?, cliente_direccion = ?, tipo_entrega = ?, metodo_pago = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    updates.cliente_nombre ?? current.cliente_nombre,
    updates.cliente_direccion ?? current.cliente_direccion,
    updates.tipo_entrega ?? current.tipo_entrega,
    updates.metodo_pago ?? current.metodo_pago,
    updates.notas ?? current.notas,
    draftId
  );

  recalcDraft(db, draftId);
  return getDraftWithItems(db, draftId);
}

function clearDraft(db, draftId) {
  db.prepare('DELETE FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ?').run(draftId);
  db.prepare(`
    UPDATE whatsapp_pedidos_borrador
    SET subtotal = 0, costo_envio = 0, total = 0, delivery_zona = '', tiempo_estimado_min = 0, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(draftId);
  return getDraftWithItems(db, draftId);
}

function removeDraftItem(db, draftId, itemId) {
  db.prepare('DELETE FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ? AND id = ?').run(draftId, itemId);
  recalcDraft(db, draftId);
  return getDraftWithItems(db, draftId);
}

function updateDraftItemQuantity(db, draftId, { itemId = null, matchText = '', cantidad }) {
  const draft = getDraftWithItems(db, draftId);
  if (!draft) throw new Error('Borrador no encontrado');

  const normalizedQty = Number(cantidad || 0);
  if (!Number.isFinite(normalizedQty) || normalizedQty < 0) {
    throw new Error('La cantidad es invalida');
  }

  let item = null;
  if (itemId) {
    item = draft.items.find((entry) => Number(entry.id) === Number(itemId)) || null;
  }

  if (!item && matchText) {
    const normalizedMatch = normalizeText(matchText);
    item = draft.items.find((entry) =>
      normalizeText(entry.nombre).includes(normalizedMatch)
      || normalizeText(entry.descripcion || '').includes(normalizedMatch)
    ) || null;
  }

  if (!item) throw new Error('No encontre ese item en el borrador');

  if (normalizedQty === 0) {
    return removeDraftItem(db, draftId, item.id);
  }

  db.prepare(`
    UPDATE whatsapp_pedidos_borrador_items
    SET cantidad = ?
    WHERE borrador_id = ? AND id = ?
  `).run(normalizedQty, draftId, item.id);

  recalcDraft(db, draftId);
  return getDraftWithItems(db, draftId);
}

function getLastOrderForPhone(db, telefono) {
  if (!telefono) return null;
  return db.prepare(`
    SELECT *
    FROM pedidos
    WHERE cliente_telefono = ?
      AND estado != 'cancelado'
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 1
  `).get(telefono);
}

function repeatLastOrderToDraft(db, { conversationId, telefono, clienteNombre = '' }) {
  const lastOrder = getLastOrderForPhone(db, telefono);
  if (!lastOrder) {
    throw new Error('No encontre un pedido anterior para este numero');
  }

  const draft = getOrCreateDraft(db, { conversationId, telefono, clienteNombre });
  clearDraft(db, draft.id);
  const items = parseJsonArray(lastOrder.items);

  items.forEach((item) => {
    db.prepare(`
      INSERT INTO whatsapp_pedidos_borrador_items (
        borrador_id, producto_id, nombre, cantidad, precio_unitario, descripcion, variantes, extras
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      item.producto_id || null,
      item.nombre || '',
      Math.max(1, Number(item.cantidad || 1)),
      Number(item.precio_unitario || 0),
      item.descripcion || '',
      JSON.stringify(item.variantes || {}),
      JSON.stringify(item.extras || [])
    );
  });

  const hydrated = updateDraftMeta(db, draft.id, {
    cliente_nombre: clienteNombre || lastOrder.cliente_nombre || '',
    cliente_direccion: lastOrder.cliente_direccion || '',
    tipo_entrega: lastOrder.tipo_entrega || 'delivery',
    metodo_pago: lastOrder.metodo_pago || '',
    notas: lastOrder.notas || '',
  });

  return {
    pedidoAnterior: lastOrder,
    borrador: hydrated,
  };
}

function draftToPedidoPayload(db, draftId, telefono) {
  recalcDraft(db, draftId);
  const draft = getDraftWithItems(db, draftId);
  if (!draft) throw new Error('Borrador no encontrado');
  if (!draft.items.length) throw new Error('El borrador no tiene items');
  if (draft.tipo_entrega === 'delivery' && !draft.cliente_direccion) {
    throw new Error('Falta la direccion para delivery');
  }
  if (draft.tipo_entrega === 'delivery') {
    const config = getConfigMap(db);
    const quote = quoteDelivery(config, draft.cliente_direccion || '');
    if (!quote.available) {
      throw new Error(quote.message || 'La direccion no pertenece a una zona de delivery valida');
    }
  }
  if (!draft.metodo_pago) {
    throw new Error('Falta definir el metodo de pago');
  }

  const items = draft.items.map((item) => ({
    producto_id: item.producto_id,
    nombre: item.nombre,
    cantidad: Number(item.cantidad || 1),
    precio_unitario: Number(item.precio_unitario || 0),
    variantes: JSON.parse(item.variantes || '{}'),
    extras: JSON.parse(item.extras || '[]'),
    descripcion: item.descripcion || '',
  }));

  return {
    draft,
    items,
    payload: {
      cliente_nombre: draft.cliente_nombre || '',
      cliente_telefono: telefono || draft.telefono || '',
      cliente_direccion: draft.cliente_direccion || '',
      items,
      subtotal: Number(draft.subtotal || 0),
      costo_envio: Number(draft.costo_envio || 0),
      descuento: 0,
      total: Number(draft.total || 0),
      tipo_entrega: draft.tipo_entrega || 'delivery',
      metodo_pago: draft.metodo_pago || 'efectivo',
      notas: draft.notas || '',
      origen: 'whatsapp',
      delivery_zona: draft.delivery_zona || '',
      tiempo_estimado_min: Number(draft.tiempo_estimado_min || 0),
    },
  };
}

function confirmDraftAsPedido(db, draftId, telefono) {
  const { draft, payload } = draftToPedidoPayload(db, draftId, telefono);
  const numero = getNextNumero(db);
  const clienteId = ensureCliente(db, {
    nombre: payload.cliente_nombre,
    telefono: payload.cliente_telefono,
    direccion: payload.cliente_direccion,
  });

  const result = db.prepare(`
    INSERT INTO pedidos (
      numero, cliente_id, cliente_nombre, cliente_telefono, cliente_direccion, items,
      subtotal, costo_envio, descuento, total, tipo_entrega, mesa, metodo_pago,
      notas, origen, pago_estado, pago_id, mp_preference_id, pago_detalle, delivery_zona, tiempo_estimado_min
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    numero,
    clienteId,
    payload.cliente_nombre,
    payload.cliente_telefono,
    payload.cliente_direccion,
    JSON.stringify(payload.items),
    payload.subtotal,
    payload.costo_envio,
    0,
    payload.total,
    payload.tipo_entrega,
    '',
    payload.metodo_pago,
    payload.notas,
    'whatsapp',
    payload.metodo_pago === 'mercadopago' ? 'pending' : 'pendiente',
    '',
    '',
    '',
    payload.delivery_zona || '',
    Number(payload.tiempo_estimado_min || 0)
  );

  db.prepare(`
    UPDATE whatsapp_pedidos_borrador
    SET estado = 'confirmado', actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(draft.id);

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(result.lastInsertRowid);
}

function summarizeDraft(draft) {
  if (!draft || !draft.items?.length) {
    return 'Todavia no hay productos cargados en el pedido.';
  }

  const itemsText = draft.items
    .map((item) => `- ${item.cantidad}x ${item.nombre}${item.descripcion ? ` (${item.descripcion})` : ''}: $${Number(item.precio_unitario || 0).toLocaleString('es-AR')}`)
    .join('\n');

  const envioText = draft.costo_envio > 0
    ? `\nEnvio: $${Number(draft.costo_envio || 0).toLocaleString('es-AR')}${draft.delivery_zona ? ` (${draft.delivery_zona})` : ''}`
    : '';
  const etaText = draft.tiempo_estimado_min > 0 ? `\nETA: ${draft.tiempo_estimado_min} min` : '';

  return `${itemsText}${envioText}${etaText}\nTotal: $${Number(draft.total || 0).toLocaleString('es-AR')}`;
}

module.exports = {
  getOrCreateDraft,
  getOpenDraft,
  getDraftWithItems,
  getLastOrderForPhone,
  searchProducts,
  getFeaturedProducts,
  getProductOptionsDetail,
  addItemToDraft,
  addConfiguredItemToDraft,
  updateDraftMeta,
  clearDraft,
  removeDraftItem,
  updateDraftItemQuantity,
  repeatLastOrderToDraft,
  confirmDraftAsPedido,
  summarizeDraft,
};
