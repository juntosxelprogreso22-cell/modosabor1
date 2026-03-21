const db = require('../db');

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function moneyToNumber(value) {
  return Number(
    String(value || '')
      .replace(/\$/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .trim()
  );
}

const CATEGORY_DEFS = [
  { nombre: 'Pizzas', icono: '\u{1F355}', color: '#ef4444', orden: 1 },
  { nombre: 'Empanadas', icono: '\u{1F95F}', color: '#f97316', orden: 2 },
  { nombre: 'Milanesas', icono: '\u{1F969}', color: '#84cc16', orden: 3 },
  { nombre: 'Papas', icono: '\u{1F35F}', color: '#f59e0b', orden: 4 },
];

const MENU = {
  Pizzas: [
    ['Común', 'Prepizza, salsa, queso, aceitunas, orégano.', '$6.000', '$3.500'],
    ['Común con huevo', 'Prepizza, salsa, queso, huevo rallado, aceitunas, orégano.', '$7.000', '$4.000'],
    ['Al Ajillo', 'Prepizza, salsa, queso, chimichurri pizzero, aceitunas, orégano.', '$6.500', '$3.750'],
    ['Napolitana', 'Prepizza, salsa, queso, rodajas de tomate, chimichurri pizzero, aceitunas, orégano.', '$7.000', '$4.000'],
    ['Napolitana Especial', 'Prepizza, salsa, queso, Jamón, rodajas de tomate, chimichurri pizzero, aceitunas, orégano.', '$8.000', '$4.500'],
    ['Jamón y Morrones', 'Prepizza, salsa, queso, Jamón, morrones, chimichurri pizzero, aceitunas, orégano.', '$8.000', '$4.500'],
    ['Choclo', 'Prepizza, salsa, queso, Choclo en crema, aceitunas, orégano.', '$8.000', '$4.500'],
    ['4 Quesos', 'Prepizza, salsa, queso, 4 tipos de quesos en hebras, aceitunas, orégano.', '$8.500', '$4.750'],
    ['Roquefort', 'Prepizza, salsa, queso, roquefort, aceitunas, orégano.', '$8.500', '$4.750'],
    ['Pepperoni', 'Prepizza, salsa, queso, rodajas de peperoni, chimichurri pizzero, aceitunas, orégano.', '$9.000', '$5.000'],
    ['Rúcula y Panceta', 'Prepizza, salsa, queso, hojas de rúcula, panceta salteada, aceitunas, orégano.', '$9.000', '$5.000'],
    ['Full Cheddar', 'Prepizza, salsa, queso, papas fritas, panceta salteada, y mucho cheddar, aceitunas, orégano.', '$10.000', '$5.500'],
  ],
  Empanadas: [
    ['Pollo', 'Empanadas de pollo jugoso, sazonadas con especias y cebolla.', '$7.000', '$4.000'],
    ['Jamón y Queso', 'Empanadas rellenas de jamón cocido y queso derretido.', '$7.000', '$4.000'],
    ['Matambre', 'Empanadas de matambre tierno, tradicionales y sabrosas.', '$10.000', '$5.500'],
    ['Verdura', 'Empanadas de verduras frescas: acelga, cebolla y huevo.', '$7.000', '$4.000'],
    ['Mondongo', 'Empanadas de mondongo, un clásico tradicional argentino.', '$8.000', '$4.500'],
  ],
  Milanesas: [
    ['Clásica', 'Milanesa de ternera o pollo. Simple, crocante y rendidora. La de siempre, la que nunca falla.', '$10.000', '$8.500'],
    ['a Caballo', 'Milanesa de ternera o pollo, con dos huevos fritos.', '$11.000', '$9.500'],
    ['Napolitana', 'Salsa de tomate + queso + jamón cocido opcional + orégano + rodajas de tomate + morrones + aceitunas. La más elegida. Jugosa, gratinada y bien clásica.', '$12.000', '$10.500'],
    ['4 Quesos', 'Mila clásica + queso + 4 variedades de quesos.', '$12.000', '$10.500'],
    ['Roquefort', 'Mila clásica + queso + queso Roquefort.', '$12.000', '$10.500'],
    ['Modo Suiza', 'Milanesa + jamón cocido + salsa blanca cremosa (bechamel) + queso gratinado. Opcional pro: toque de parmesano arriba.', '$12.000', '$10.500'],
    ['Modo Cheddar', 'Milanesa + cheddar + panceta (bacon) + verdeo/ciboulette.', '$12.000', '$10.500'],
    ['Modo Sabor BBQ', 'Milanesa + cheddar + panceta (bacon) + cebolla caramelizada + 2 huevos fritos + salsa barbacoa.', '$15.000', '$13.500'],
    ['Mediterránea', 'Milanesa + muzzarella + rúcula + parmesano + tomates cherry confitados + (opcional) aceite de oliva.', '$13.000', '$11.500'],
    ['Dulce Picante', 'Milanesa + muzzarella + morrones asados + cebolla crispy + salsa picante agridulce (ají y ajo) + salsa fresca de tomate y cebolla con limón + verdeo.', '$13.000', '$11.500'],
  ],
  Papas: [
    ['Papas Full Cheddar', '500 gramos de papas, 200 gramos de queso cheddar, 50 gramos de panceta y cebolla de verdeo.', '$7.000'],
  ],
};

function buildProductPayload(categoryName, row) {
  const [nombre, descripcion, priceA, priceB] = row;

  if (categoryName === 'Pizzas') {
    const mitad = moneyToNumber(priceB);
    const entera = moneyToNumber(priceA);
    return {
      nombre,
      descripcion,
      precio: mitad,
      variantes: JSON.stringify([
        {
          nombre: 'Presentacion',
          opciones: [
            { nombre: 'Mitad', precio_extra: 0 },
            { nombre: 'Entera', precio_extra: entera - mitad },
          ],
        },
      ]),
      extras: '[]',
      tiempo_preparacion: 20,
    };
  }

  if (categoryName === 'Empanadas') {
    const media = moneyToNumber(priceB);
    const docena = moneyToNumber(priceA);
    return {
      nombre,
      descripcion,
      precio: media,
      variantes: JSON.stringify([
        {
          nombre: 'Presentacion',
          opciones: [
            { nombre: 'Media docena', precio_extra: 0 },
            { nombre: 'Docena', precio_extra: docena - media },
          ],
        },
      ]),
      extras: '[]',
      tiempo_preparacion: 15,
    };
  }

  if (categoryName === 'Milanesas') {
    const ternera = moneyToNumber(priceA);
    const pollo = moneyToNumber(priceB);
    return {
      nombre,
      descripcion,
      precio: pollo,
      variantes: JSON.stringify([
        {
          nombre: 'Tipo',
          opciones: [
            { nombre: 'Pollo', precio_extra: 0 },
            { nombre: 'Ternera', precio_extra: ternera - pollo },
          ],
        },
      ]),
      extras: '[]',
      tiempo_preparacion: 20,
    };
  }

  return {
    nombre,
    descripcion,
    precio: moneyToNumber(priceA),
    variantes: '[]',
    extras: '[]',
    tiempo_preparacion: 12,
  };
}

const selectCategory = db.prepare('SELECT * FROM categorias WHERE lower(nombre) = lower(?)');
const insertCategory = db.prepare('INSERT INTO categorias (nombre, icono, color, orden, activo) VALUES (?, ?, ?, ?, 1)');
const updateCategory = db.prepare('UPDATE categorias SET icono = ?, color = ?, orden = ?, activo = 1 WHERE id = ?');
const selectProducts = db.prepare('SELECT * FROM productos');
const insertProduct = db.prepare(`
  INSERT INTO productos (
    nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras, activo, destacado, tiempo_preparacion
  ) VALUES (?, ?, ?, ?, ?, '', ?, ?, 1, 0, ?)
`);
const updateProduct = db.prepare(`
  UPDATE productos
  SET nombre = ?, descripcion = ?, precio = ?, categoria_id = ?, variantes = ?, extras = ?, activo = 1, tiempo_preparacion = ?
  WHERE id = ?
`);

const categories = {};
for (const category of CATEGORY_DEFS) {
  const existing = selectCategory.get(category.nombre);
  if (existing) {
    updateCategory.run(category.icono, category.color, category.orden, existing.id);
    categories[category.nombre] = existing.id;
  } else {
    const result = insertCategory.run(category.nombre, category.icono, category.color, category.orden);
    categories[category.nombre] = Number(result.lastInsertRowid);
  }
}

const existingProducts = selectProducts.all();
const existingMap = new Map(
  existingProducts.map((product) => [
    `${normalizeName(product.nombre)}::${product.categoria_id || ''}`,
    product,
  ])
);

let inserted = 0;
let updated = 0;

for (const [categoryName, rows] of Object.entries(MENU)) {
  const categoriaId = categories[categoryName];
  for (const row of rows) {
    const payload = buildProductPayload(categoryName, row);
    const key = `${normalizeName(payload.nombre)}::${categoriaId}`;
    const existing = existingMap.get(key);

    if (existing) {
      updateProduct.run(
        payload.nombre,
        payload.descripcion,
        payload.precio,
        categoriaId,
        payload.variantes,
        payload.extras,
        payload.tiempo_preparacion,
        existing.id
      );
      updated += 1;
    } else {
      insertProduct.run(
        payload.nombre,
        payload.descripcion,
        payload.precio,
        0,
        categoriaId,
        payload.variantes,
        payload.extras,
        payload.tiempo_preparacion
      );
      inserted += 1;
    }
  }
}

const totalProductos = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;
console.log(JSON.stringify({
  ok: true,
  categories: Object.keys(categories).length,
  inserted,
  updated,
  totalProductos,
}, null, 2));
