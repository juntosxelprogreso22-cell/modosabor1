const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const { startAutomaticBackups } = require('./utils/backupManager');
const { getConfigMap } = require('./utils/mercadoPago');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

try {
  const productsCount = db.prepare('SELECT COUNT(*) AS total FROM productos').get()?.total || 0;
  if (productsCount === 0) {
    console.log('Base vacia detectada. Cargando menu inicial de Modo Sabor...');
    require('./scripts/seedMenuModoSabor');
  }
} catch (error) {
  console.error('No se pudo cargar el menu inicial automaticamente:', error.message);
}

app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/repartidores', require('./routes/repartidores'));
app.use('/api/personal', require('./routes/personal'));
app.use('/api/caja', require('./routes/caja'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

app.get('/api/health', (_req, res) => {
  try {
    const config = getConfigMap(db);
    const dbCheck = db.prepare('SELECT 1 AS ok').get();

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      checks: {
        db: dbCheck?.ok === 1,
        publicAppUrl: Boolean(config.public_app_url),
        publicApiUrl: Boolean(config.public_api_url),
        mercadoPagoConfigured: Boolean(config.mercadopago_token),
        whatsAppConfigured: Boolean(config.whatsapp_api_token && config.whatsapp_phone_number_id),
      },
      corsOrigins: allowedOrigins,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

io.on('connection', () => {});

startAutomaticBackups(db);

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => console.log(`Modo Sabor API corriendo en http://localhost:${PORT}`));
