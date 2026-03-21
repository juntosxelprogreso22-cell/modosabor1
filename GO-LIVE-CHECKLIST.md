# Modo Sabor - Checklist de salida a produccion

## 1. Base tecnica
- [ ] Backend publicado con URL HTTPS fija
- [ ] Frontend publicado con URL HTTPS fija
- [ ] `public_app_url` cargada en configuracion
- [ ] `public_api_url` cargada en configuracion
- [ ] `CORS_ORIGINS` configurado con la URL real del frontend
- [ ] Backup de la base SQLite definido
- [ ] Probar `GET /api/health`

## 2. MercadoPago
- [ ] Cargar `mercadopago_token` real
- [ ] Confirmar diagnostico en configuracion
- [ ] Crear pedido real con MercadoPago
- [ ] Volver al sitio despues del pago
- [ ] Confirmar webhook en `mercadopago_eventos`
- [ ] Confirmar estado final del pedido: `approved`, `pending` o `rejected`
- [ ] Probar boton de sincronizacion manual de pagos

## 3. WhatsApp API
- [ ] Cargar `whatsapp_api_token`
- [ ] Cargar `whatsapp_phone_number_id`
- [ ] Cargar `whatsapp_webhook_verify_token`
- [ ] Configurar webhook en Meta hacia `/api/whatsapp/webhook`
- [ ] Enviar mensaje de prueba desde configuracion
- [ ] Confirmar recepcion de mensaje entrante
- [ ] Confirmar respuesta automatica del agente
- [ ] Confirmar derivacion a inbox humano

## 4. Menu y pedidos
- [ ] Revisar categorias y productos cargados
- [ ] Revisar precios y variantes del menu real
- [ ] Probar pedido web
- [ ] Probar pedido por TPV
- [ ] Probar pedido generado por WhatsApp
- [ ] Confirmar que todos entren en `Pedidos`

## 5. Delivery
- [ ] Configurar zonas reales de delivery
- [ ] Probar direccion valida con zona
- [ ] Probar direccion fuera de zona
- [ ] Confirmar costo de envio correcto
- [ ] Confirmar ETA correcto
- [ ] Probar seguimiento del pedido
- [ ] Probar rider compartiendo ubicacion

## 6. Impresion
- [ ] Ajustar `impresion_margen_mm`
- [ ] Ajustar `impresion_escala_fuente`
- [ ] Usar prueba A6 desde configuracion
- [ ] Probar comanda desde TPV
- [ ] Probar ticket desde Pedidos
- [ ] Confirmar lectura correcta de variantes y notas

## 7. Operacion y seguridad
- [ ] Probar login con cada rol
- [ ] Confirmar permisos por modulo
- [ ] Cambiar contrasena desde `Mi cuenta`
- [ ] Probar cierre de caja
- [ ] Revisar auditoria de eventos
- [ ] Revisar reportes premium
- [ ] Revisar clientes inactivos y campana de recompra

## 8. Ensayo general
- [ ] Pedido web + pago + impresion + cocina + entrega + seguimiento
- [ ] Pedido por WhatsApp + confirmacion + impresion + entrega
- [ ] Pedido take away en TPV + ticket
- [ ] Confirmar que el sistema aguante todo el flujo sin errores
