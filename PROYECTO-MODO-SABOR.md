# Modo Sabor

## Vision

Modo Sabor sera un sistema integral para delivery, retiro en local y, mas adelante, atencion en mesas. El sistema tendra:

- web publica para pedidos
- dashboard admin
- TPV para venta rapida
- gestion de pedidos y delivery
- gestion de productos, categorias y clientes
- reportes y configuracion
- integraciones con pagos argentinos
- automatizacion por WhatsApp e IA en una fase posterior
- impresion de comandas y tickets A6

## Documentos de detalle

- [IMPRESION-A6-COMANDAS.md](C:\Users\Exe\.verdent\verdent-projects\modosabor1\IMPRESION-A6-COMANDAS.md): especificacion aterrizada del modulo de impresion que conviene encarar primero

## Objetivo real del proyecto

Construir primero una base operativa fuerte para vender todos los dias sin romperse, y despues sumar automatizacion, tracking en vivo y funciones premium.

## Modulos del sistema

### 1. Web Publica

Funcion:

- mostrar menu en una sola pagina
- permitir pedir desde celular o PC
- soportar delivery y retiro
- permitir elegir variantes, extras y metodo de pago

Debe contener:

- logo, direccion, telefono y horarios
- categorias visibles
- productos con imagen, descripcion y precio
- variantes: pizza entera, mitades, tamanos, docena/media docena, extras
- carrito
- checkout
- confirmacion de pedido
- mas adelante: tracking en tiempo real

Estado actual:

- existe
- permite listar productos y generar pedido
- falta cerrar variantes complejas reales, pagos integrados y tracking

### 2. Dashboard

Funcion:

- mostrar estado general del negocio

Debe contener:

- ventas del dia
- pedidos activos
- ultimos pedidos
- metodos de pago
- mas adelante: productos mas vendidos, clientes frecuentes, horas pico, alertas

Estado actual:

- existe
- tiene metricas basicas y grafico simple
- falta inteligencia comercial real

### 3. TPV

Funcion:

- cobrar rapido en local
- usarlo para retiro, delivery y luego mesas

Debe contener:

- buscador rapido
- categorias y productos
- carrito/ticket
- descuentos
- variantes
- tipo de entrega
- impresion
- mas adelante: mesas, dividir cuenta, pre-cuenta

Estado actual:

- existe
- necesita seguir madurando para ser el centro operativo real

### 4. Pedidos

Funcion:

- administrar todo el flujo de pedido

Estados previstos:

- nuevo
- confirmado
- preparando
- listo
- en_camino
- entregado
- cancelado

Debe contener:

- vista por columnas o lista
- cambio de estado
- detalle
- reimpresion
- contacto con cliente
- filtros por fecha, estado, canal

Estado actual:

- existe y es funcional en base
- falta vista mas avanzada, seguimiento cliente y mejor integracion con impresion

### 5. Delivery

Funcion:

- gestionar repartidores y entregas

Debe contener:

- repartidores
- disponibilidad
- asignacion de pedido
- entregas activas
- historial de entregas
- mas adelante: geolocalizacion, tracking en vivo, autoasignacion

Estado actual:

- existe
- ya permite gestionar repartidores y entregas basicas
- falta GPS, ETA, mapa y tracking cliente

### 6. Categorias

Funcion:

- organizar el menu

Debe contener:

- nombre
- color
- icono
- imagen
- orden
- subcategorias
- activacion/desactivacion

Estado actual:

- existe y ya tiene mejor UI
- soporta imagenes y subcategorias

### 7. Productos

Funcion:

- administrar menu real

Debe contener:

- nombre
- descripcion
- categoria
- precio
- costo
- imagen
- variantes
- extras
- destacado
- stock logico
- tiempo de preparacion

Casos reales de Modo Sabor:

- pizzas enteras
- pizzas por mitades
- empanadas por unidad, media docena y docena
- milanesas con variantes y agregados

Estado actual:

- existe
- ya soporta variantes y extras
- falta pulir reglas de negocio, impresion detallada y uso total en TPV/web

### 8. Clientes

Funcion:

- centralizar historial y fidelizacion

Debe contener:

- nombre, telefono, direccion, email
- historial de pedidos
- total gastado
- frecuencia
- nivel
- puntos
- sellos
- premios pendientes
- notas

Estado actual:

- existe
- fidelizacion automatica ya encaminada desde pedidos entregados
- falta marketing automatico, cupones y segmentos avanzados

### 9. Reportes

Funcion:

- entender ventas y operacion

Debe contener:

- ventas por periodo
- ventas por producto
- ventas por categoria
- metodos de pago
- clientes mas frecuentes
- rentabilidad
- horarios de mayor venta

Estado actual:

- existe con version basica
- falta profundidad

## Prioridad operativa recomendada

El siguiente bloque a construir no deberia ser todavia IA ni tracking GPS. Lo mas rentable ahora es:

1. impresion A6 y comandas
2. seguimiento del pedido para cliente
3. seguimiento de delivery
4. pagos integrados reales

La impresion ya quedo detallada en `IMPRESION-A6-COMANDAS.md`.

### 10. Configuracion

Funcion:

- personalizar el sistema sin tocar codigo

Debe contener:

- nombre del negocio
- logo
- direccion
- telefono
- email
- horarios
- moneda
- color principal
- costo de envio
- tiempo de delivery
- tiempo de retiro
- medios de pago
- mensaje de confirmacion
- mas adelante: favicon, tema visual, impresoras, usuarios, impuestos, zonas

Estado actual:

- existe
- ya cubre buena parte del MVP
- falta capa premium de personalizacion

## Estado real del proyecto hoy

### Hecho o casi hecho

- login admin
- estructura general del dashboard
- categorias
- productos
- clientes
- pedidos basicos
- delivery basico
- configuracion base
- web publica base
- base de datos local SQLite
- subida de imagenes
- eventos en tiempo real por socket

### Parcial

- TPV
- reportes
- fidelizacion
- integracion de productos/variantes entre todos los modulos
- flujo completo delivery

### Faltante importante

- tracking de pedido para cliente
- tracking GPS de repartidor
- app rider o vista rider
- pagos reales con MercadoPago y otros
- webhook de pagos
- bot de WhatsApp
- IA conversacional
- impresion A6 real
- comandas cocina/caja
- facturacion
- mesas y reservas
- pantalla cocina
- roles y permisos reales
- analitica premium

## Fases del proyecto

### Fase 1. Base operativa

Objetivo:

- poder vender todos los dias con estabilidad

Incluye:

- dashboard funcional
- TPV funcional
- categorias y productos completos
- pedidos internos y web
- delivery basico
- clientes con fidelizacion automatica
- configuracion base

### Fase 2. Operacion profesional

Objetivo:

- cerrar todo lo necesario para operar mejor

Incluye:

- impresion A6
- comandas
- pagos integrados
- reportes mejores
- mejor flujo de estados
- seguimiento del pedido para cliente

### Fase 3. Automatizacion

Objetivo:

- bajar trabajo manual

Incluye:

- WhatsApp automatizado
- bot IA
- notificaciones automativas
- recuperacion de clientes
- cupones y acciones de fidelizacion

### Fase 4. Expansion

Objetivo:

- preparar Modo Sabor para crecer

Incluye:

- mesas
- reservas
- pantalla cocina
- multiusuario con permisos finos
- multi-sucursal

## Prioridades recomendadas

### Prioridad 1

- cerrar flujo pedido -> cobro -> estado -> entrega
- dejar TPV y pedidos realmente solidos
- cerrar impresion A6

### Prioridad 2

- seguimiento del pedido para cliente
- delivery con mapa y ETA
- integracion MercadoPago

### Prioridad 3

- WhatsApp automatizado
- IA para toma de pedidos
- CRM y fidelizacion avanzada

## Lo siguiente que recomiendo construir

Sprint recomendado:

1. Impresion A6 y comandas
2. Tracking del pedido del cliente
3. Integracion real de MercadoPago
4. Mejoras finales de TPV

## Stack actual y criterio

Stack actual del proyecto:

- frontend React + Vite
- backend Node + Express
- SQLite local
- socket.io
- uploads locales

Esto sirve perfecto para:

- arrancar
- validar el negocio
- vender
- probar flujos

Mas adelante puede migrarse a:

- PostgreSQL
- storage cloud
- servicios separados para pagos, tracking y bot

## Regla de trabajo para seguir

En cada sesion vamos a manejar esto asi:

1. elegir un modulo
2. definir exactamente que se cierra
3. implementarlo
4. probarlo
5. actualizar este documento

## Proximo paso sugerido

Seguir con:

- impresion A6 y comandas

Porque hoy eso tiene impacto directo en operacion real y despues se apoya todo mejor: cocina, caja, delivery y seguimiento.
