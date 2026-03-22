# WhatsApp en Render

## Que numero usa el sistema

Hay 3 datos distintos y cada uno cumple una funcion distinta:

- `WHATSAPP_NUMERO`
  Es el numero visible del negocio. Se usa para links `wa.me`, botones de contacto y textos publicos.
  Ejemplo: `5493815988735`

- `WHATSAPP_PHONE_NUMBER_ID`
  No es un telefono visible. Es el identificador interno que te da Meta para poder enviar mensajes desde la API oficial.
  Sale en WhatsApp Cloud API.

- `WHATSAPP_TEST_DESTINO`
  Es el numero al que queres mandar una prueba desde configuracion.
  Puede ser tu numero personal si esta habilitado para pruebas en Meta.

## Para que el bot responda de verdad

En Render el backend necesita estas variables:

```env
PUBLIC_APP_URL=https://modosabor-frontend.onrender.com
PUBLIC_API_URL=https://modosabor-backend.onrender.com
WHATSAPP_MODO_ENVIO=api
WHATSAPP_BOT_ACTIVO=1
WHATSAPP_AI_ACTIVA=1
WHATSAPP_NUMERO=5493815988735
WHATSAPP_API_PROVIDER=meta
WHATSAPP_API_VERSION=v23.0
WHATSAPP_API_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=modo-sabor-bot
WHATSAPP_TEST_DESTINO=5493815988735
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

## Webhook en Meta

Configurar el webhook a:

```text
https://modosabor-backend.onrender.com/api/whatsapp/webhook
```

Verify token:

```text
modo-sabor-bot
```

## Como probar

1. Guardar variables en Render.
2. Redeploy del backend.
3. En admin ir a Configuracion -> WhatsApp.
4. Ejecutar `Probar WhatsApp`.
5. Ejecutar `Enviar prueba`.
6. Mandar un mensaje real al numero del negocio.
7. Verificar que aparezca en Inbox y que el bot responda.

## Nota importante

Si `WHATSAPP_MODO_ENVIO=manual`, el bot no puede responder mensajes entrantes automaticamente.
En ese modo solo sirve el numero publico para links `wa.me`.
