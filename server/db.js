const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'modosabor.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function hasColumn(table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((item) => item.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT DEFAULT 'admin',
    activo INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS repartidores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    vehiculo TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    disponible INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS personal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol_operativo TEXT NOT NULL DEFAULT 'cocina',
    telefono TEXT DEFAULT '',
    turno_preferido TEXT DEFAULT '',
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    activo INTEGER DEFAULT 1,
    notas TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    icono TEXT DEFAULT '🍽️',
    color TEXT DEFAULT '#f97316',
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio REAL NOT NULL DEFAULT 0,
    costo REAL DEFAULT 0,
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    imagen TEXT DEFAULT '',
    variantes TEXT DEFAULT '[]',
    extras TEXT DEFAULT '[]',
    activo INTEGER DEFAULT 1,
    destacado INTEGER DEFAULT 0,
    tiempo_preparacion INTEGER DEFAULT 15,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    total_gastado REAL DEFAULT 0,
    total_pedidos INTEGER DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER UNIQUE,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT DEFAULT '',
    cliente_telefono TEXT DEFAULT '',
    cliente_direccion TEXT DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    costo_envio REAL DEFAULT 0,
    descuento REAL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    estado TEXT DEFAULT 'nuevo',
    tipo_entrega TEXT DEFAULT 'delivery',
    mesa TEXT DEFAULT '',
    metodo_pago TEXT DEFAULT 'efectivo',
    notas TEXT DEFAULT '',
    origen TEXT DEFAULT 'tpv',
    repartidor_id INTEGER REFERENCES repartidores(id) ON DELETE SET NULL,
    repartidor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS impresiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    area TEXT DEFAULT '',
    estado TEXT DEFAULT 'pendiente',
    copias INTEGER DEFAULT 1,
    intentos INTEGER DEFAULT 0,
    error TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    impreso_en DATETIME
  );

  CREATE TABLE IF NOT EXISTS whatsapp_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    tipo TEXT DEFAULT '',
    telefono TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    proveedor TEXT DEFAULT 'manual',
    estado TEXT DEFAULT 'pendiente',
    externo_id TEXT DEFAULT '',
    error TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    enviado_en DATETIME
  );

  CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT UNIQUE NOT NULL,
    nombre TEXT DEFAULT '',
    ultimo_estado TEXT DEFAULT 'nuevo',
    ultimo_contexto TEXT DEFAULT '',
    escalado_humano INTEGER DEFAULT 0,
    ultimo_mensaje_en DATETIME,
    ultima_respuesta_en DATETIME,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER REFERENCES whatsapp_conversaciones(id) ON DELETE CASCADE,
    telefono TEXT NOT NULL,
    direccion TEXT NOT NULL,
    tipo TEXT DEFAULT 'text',
    contenido TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_pedidos_borrador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER REFERENCES whatsapp_conversaciones(id) ON DELETE CASCADE,
    telefono TEXT NOT NULL,
    cliente_nombre TEXT DEFAULT '',
    cliente_direccion TEXT DEFAULT '',
    tipo_entrega TEXT DEFAULT 'delivery',
    metodo_pago TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    estado TEXT DEFAULT 'abierto',
    subtotal REAL DEFAULT 0,
    costo_envio REAL DEFAULT 0,
    total REAL DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_pedidos_borrador_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrador_id INTEGER REFERENCES whatsapp_pedidos_borrador(id) ON DELETE CASCADE,
    producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    cantidad INTEGER DEFAULT 1,
    precio_unitario REAL DEFAULT 0,
    descripcion TEXT DEFAULT '',
    variantes TEXT DEFAULT '{}',
    extras TEXT DEFAULT '[]',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cierres_caja (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estado TEXT DEFAULT 'abierta',
    abierta_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    abierta_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    abierta_por_nombre TEXT DEFAULT '',
    monto_inicial REAL DEFAULT 0,
    notas_apertura TEXT DEFAULT '',
    cerrada_en DATETIME,
    cerrada_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cerrada_por_nombre TEXT DEFAULT '',
    monto_final_declarado REAL DEFAULT 0,
    efectivo_esperado REAL DEFAULT 0,
    diferencia REAL DEFAULT 0,
    resumen_json TEXT DEFAULT '{}',
    notas_cierre TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modulo TEXT NOT NULL,
    accion TEXT NOT NULL,
    entidad TEXT DEFAULT '',
    entidad_id TEXT DEFAULT '',
    actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nombre TEXT DEFAULT '',
    detalle TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mesa_reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa TEXT NOT NULL,
    cliente_nombre TEXT NOT NULL,
    cliente_telefono TEXT DEFAULT '',
    cantidad_personas INTEGER DEFAULT 2,
    horario_reserva TEXT NOT NULL,
    notas TEXT DEFAULT '',
    estado TEXT DEFAULT 'reservada',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mercadopago_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    tipo TEXT DEFAULT '',
    payment_id TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    detalle TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

ensureColumn('categorias', 'imagen', "TEXT DEFAULT ''");
ensureColumn('categorias', 'subcategorias', "TEXT DEFAULT '[]'");
ensureColumn('clientes', 'fecha_nacimiento', "TEXT DEFAULT ''");
ensureColumn('clientes', 'nivel', "TEXT DEFAULT 'Bronce'");
ensureColumn('clientes', 'puntos', "INTEGER DEFAULT 0");
ensureColumn('clientes', 'sellos', "INTEGER DEFAULT 0");
ensureColumn('clientes', 'frecuencia_dias', "INTEGER DEFAULT 7");
ensureColumn('clientes', 'canjes_premio', "INTEGER DEFAULT 0");
ensureColumn('repartidores', 'latitud', 'REAL');
ensureColumn('repartidores', 'longitud', 'REAL');
ensureColumn('repartidores', 'ultima_ubicacion_en', 'TEXT');
ensureColumn('repartidores', 'codigo_acceso', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'zona_preferida', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'pago_estado', "TEXT DEFAULT 'pendiente'");
ensureColumn('pedidos', 'pago_id', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'mp_preference_id', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'pago_detalle', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'delivery_zona', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'tiempo_estimado_min', 'INTEGER DEFAULT 0');
ensureColumn('pedidos', 'turno_operativo', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'entrega_pin', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'cliente_latitud', 'REAL');
ensureColumn('pedidos', 'cliente_longitud', 'REAL');
ensureColumn('pedidos', 'entrega_foto', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'entrega_foto_en', 'TEXT');
ensureColumn('pedidos', 'repartidor_id', 'INTEGER');
ensureColumn('pedidos', 'repartidor_nombre', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'delivery_zona', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'tiempo_estimado_min', 'INTEGER DEFAULT 0');

const userCount = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
if (userCount.c === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run('Administrador', 'admin@modosabor.com', hash, 'admin');
  console.log('Usuario admin creado: admin@modosabor.com / admin123');
}

const defaultConfig = {
  negocio_nombre: 'Modo Sabor',
  negocio_descripcion: 'Pizzas, Empanadas y Milanesas',
  negocio_direccion: 'Monteros, Tucuman',
  negocio_localidad: 'Monteros',
  negocio_provincia: 'Tucuman',
  negocio_codigo_postal: '4142',
  negocio_telefono: '',
  negocio_email: '',
  negocio_logo: '',
  negocio_favicon: '',
  moneda_simbolo: '$',
  moneda_codigo: 'ARS',
  costo_envio_base: '0',
  tiempo_delivery: '25',
  tiempo_retiro: '20',
  delivery_validacion_activa: '0',
  delivery_zonas: JSON.stringify([
    {
      id: 'monteros',
      nombre: 'Monteros',
      keywords: ['monteros', 'centro', 'casco centrico', 'las piedras'],
      costo_envio: 0,
      tiempo_estimado_min: 25,
      activa: true,
    },
    {
      id: 'cerca',
      nombre: 'Fuera de Monteros - cerca',
      keywords: ['santa lucia', 'santalucia', 'villa quinteros'],
      costo_envio: 1500,
      tiempo_estimado_min: 40,
      activa: true,
    },
    {
      id: 'extendida',
      nombre: 'Fuera de Monteros - extendida',
      keywords: ['ruta', 'km', 'afuera', 'rio seco', 'famailla', 'concepcion'],
      costo_envio: 2500,
      tiempo_estimado_min: 55,
      activa: true,
    },
  ]),
  mesas_cantidad: '12',
  mesas_nombres: '',
  metodos_pago: JSON.stringify(['efectivo', 'mercadopago', 'transferencia', 'modo', 'uala']),
  color_primario: '#f97316',
  whatsapp_numero: '',
  whatsapp_notificaciones_auto: '0',
  whatsapp_modo_envio: 'manual',
  whatsapp_api_provider: 'meta',
  whatsapp_api_version: 'v23.0',
  whatsapp_api_token: '',
  whatsapp_phone_number_id: '',
  whatsapp_test_destino: '',
  whatsapp_webhook_verify_token: 'modo-sabor-bot',
  whatsapp_bot_activo: '0',
  whatsapp_ai_activa: '0',
  whatsapp_ai_modelo: 'gpt-5-mini',
  openai_api_key: '',
  whatsapp_bot_bienvenida: 'Hola {{cliente}}. Soy el asistente virtual de {{negocio}}. Puedo ayudarte con el menu, productos, seguimiento de pedido y derivarte a una persona. Escribi MENU para empezar.',
  whatsapp_bot_fallback: 'Puedo ayudarte con MENU, PIZZAS, EMPANADAS, MILANESAS, SEGUIMIENTO 123 o HUMANO. Tambien podes pedir directo aca: {{pedido_url}}',
  whatsapp_bot_humano: 'Perfecto, te derivamos con una persona del equipo de {{negocio}}. En breve te responden por este mismo chat.',
  whatsapp_bot_link_pedidos: '',
  whatsapp_mensaje_nuevo: 'Hola {{cliente}}. Recibimos tu pedido #{{numero}} en {{negocio}}. Total: {{total}}. Seguilo aca: {{seguimiento_url}}',
  whatsapp_mensaje_confirmado: 'Hola {{cliente}}. Tu pedido #{{numero}} ya fue confirmado en {{negocio}}. Tiempo estimado: {{tiempo_estimado}}. Seguilo aca: {{seguimiento_url}}',
  whatsapp_mensaje_preparando: 'Hola {{cliente}}. Ya estamos preparando tu pedido #{{numero}}. Te avisamos cuando salga. Seguimiento: {{seguimiento_url}}',
  whatsapp_mensaje_listo: 'Hola {{cliente}}. Tu pedido #{{numero}} ya esta listo. Si es delivery, sale en breve. Seguimiento: {{seguimiento_url}}',
  whatsapp_mensaje_en_camino: 'Hola {{cliente}}. Tu pedido #{{numero}} ya va en camino. Repartidor: {{repartidor}}. Seguimiento: {{seguimiento_url}}',
  whatsapp_mensaje_entregado: 'Hola {{cliente}}. Tu pedido #{{numero}} fue entregado. Gracias por elegir {{negocio}}. Si queres, dejanos tu resena aca: {{resena_url}}. Tu proxima compra puede usar {{cupon}}.',
  whatsapp_mensaje_cancelado: 'Hola {{cliente}}. Tu pedido #{{numero}} fue cancelado. Si necesitas ayuda, escribinos por este medio.',
  postventa_url_resena: '',
  postventa_cupon_recompra: 'VOLVE10',
  public_app_url: 'http://localhost:5173',
  public_api_url: 'http://localhost:3001',
  mercadopago_token: '',
  mercadopago_binary_mode: '0',
  cbu_alias: '',
  mensaje_confirmacion: '¡Gracias por tu pedido! En breve lo estamos preparando.',
  impresion_formato: 'a6',
  impresion_auto_tpv: '0',
  impresion_auto_web: '0',
  impresion_margen_mm: '8',
  impresion_escala_fuente: '1',
  impresion_mensaje_ticket: 'Gracias por elegirnos',
  impresion_copias_comanda: '1',
  impresion_copias_ticket: '1',
  delivery_requiere_foto_entrega: '0',
  crm_dias_inactividad: '15',
  crm_cupon_recompra: 'VOLVE10',
  crm_mensaje_recompra: 'Hola {{cliente}}, te extrañamos en {{negocio}}. Volvé con el cupón {{cupon}} y pedí directo acá: {{pedido_url}}',
  backup_automatico_activo: '1',
  backup_intervalo_horas: '24',
  backup_max_archivos: '14',
  turnos_negocio: JSON.stringify([
    { id: 'manana', nombre: 'Turno manana', desde: '11:00', hasta: '14:00', activo: true },
    { id: 'noche', nombre: 'Turno noche', desde: '20:30', hasta: '02:00', activo: true },
  ]),
  horarios: JSON.stringify({
    lunes: { abierto: true, desde: '18:00', hasta: '23:30' },
    martes: { abierto: true, desde: '18:00', hasta: '23:30' },
    miercoles: { abierto: true, desde: '18:00', hasta: '23:30' },
    jueves: { abierto: true, desde: '18:00', hasta: '23:30' },
    viernes: { abierto: true, desde: '18:00', hasta: '00:00' },
    sabado: { abierto: true, desde: '18:00', hasta: '00:00' },
    domingo: { abierto: true, desde: '18:00', hasta: '23:30' }
  }),
  numero_pedido_actual: '1'
};

const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
Object.entries(defaultConfig).forEach(([k, v]) => insertConfig.run(k, v));

const negocioDireccionRow = db.prepare("SELECT valor FROM configuracion WHERE clave = 'negocio_direccion'").get();
if (!negocioDireccionRow?.valor || negocioDireccionRow.valor === 'Tu dirección aquí') {
  db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('negocio_direccion', ?)").run(defaultConfig.negocio_direccion);
}

const zonasRow = db.prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_zonas'").get();
try {
  const zonas = JSON.parse(zonasRow?.valor || '[]');
  const oldIds = ['centro', 'cercana', 'extendida'];
  if (Array.isArray(zonas) && zonas.length > 0 && zonas.every((item) => oldIds.includes(String(item.id || '')))) {
    db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('delivery_zonas', ?)").run(defaultConfig.delivery_zonas);
    db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('costo_envio_base', ?)").run(defaultConfig.costo_envio_base);
    db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('tiempo_delivery', ?)").run(defaultConfig.tiempo_delivery);
  }
} catch {}

const catCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
if (catCount.c === 0) {
  const cats = [['Pizzas','🍕','#ef4444',1],['Empanadas','🥟','#f97316',2],['Milanesas','🥩','#84cc16',3]];
  const ins = db.prepare('INSERT INTO categorias (nombre, icono, color, orden) VALUES (?, ?, ?, ?)');
  cats.forEach(c => ins.run(...c));
}

module.exports = db;
