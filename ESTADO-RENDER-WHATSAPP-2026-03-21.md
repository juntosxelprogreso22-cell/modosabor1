## Estado actual

- Proyecto: `modosabor1`
- Repo Git: `https://github.com/juntosxelprogreso22-cell/modosabor1.git`
- Branch actual: `main`
- Ultimo commit sincronizado con GitHub: `f08e444` - `Agregar ejemplo de variables para WhatsApp en Render`
- Estado local al 2026-03-21: sin cambios pendientes en git

## Lo que ya esta hecho

- El backend ya tiene webhook de verificacion en `GET /api/whatsapp/webhook`.
- El backend ya recibe mensajes entrantes en `POST /api/whatsapp/webhook`.
- El backend ya puede responder por WhatsApp API si `WHATSAPP_MODO_ENVIO=api`.
- La pantalla de `Configuracion` ya tiene:
  - diagnostico de WhatsApp
  - envio de mensaje de prueba
  - campos para token, `phone_number_id`, verify token y numero de prueba
- Se agrego `WHATSAPP-RENDER.md` con las variables necesarias para Render.
- Se agrego `server/.env.example` con ejemplo de configuracion de produccion.

## Lo que falta para que funcione en Render

1. Revisar el servicio backend en Render y cargar estas variables:
   - `PUBLIC_APP_URL`
   - `PUBLIC_API_URL`
   - `WHATSAPP_MODO_ENVIO=api`
   - `WHATSAPP_BOT_ACTIVO=1`
   - `WHATSAPP_AI_ACTIVA=1`
   - `WHATSAPP_NUMERO`
   - `WHATSAPP_API_PROVIDER=meta`
   - `WHATSAPP_API_VERSION=v23.0`
   - `WHATSAPP_API_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - `WHATSAPP_TEST_DESTINO`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL=gpt-5-mini`
2. En Meta configurar el webhook del backend:
   - URL: `https://modosabor-backend.onrender.com/api/whatsapp/webhook`
   - Verify token: el mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Hacer redeploy del backend.
4. Entrar al admin:
   - `Configuracion -> WhatsApp`
   - `Probar WhatsApp`
   - `Enviar prueba`
5. Mandar un mensaje real al numero del negocio y confirmar:
   - que entra en `WhatsApp Inbox`
   - que el bot responde

## Riesgos a revisar si algo no anda

- Si `WHATSAPP_MODO_ENVIO=manual`, el bot no responde solo.
- Si falta `WHATSAPP_API_TOKEN` o `WHATSAPP_PHONE_NUMBER_ID`, la prueba va a fallar.
- Si falta `OPENAI_API_KEY`, la IA no responde aunque WhatsApp API este conectado.
- El proyecto usa SQLite en `server/data/modosabor.db`.
- En Render, un backend sin disco persistente pierde archivos locales en reinicios o redeploys.
- Conviene revisar que el backend tenga disco persistente o plan claro de backups antes de depender de SQLite en produccion.

## Archivos clave para retomar

- `WHATSAPP-RENDER.md`
- `server/.env.example`
- `server/routes/whatsapp.js`
- `server/utils/runtimeConfig.js`
- `server/utils/whatsapp.js`
- `server/utils/whatsappBot.js`
- `server/routes/configuracion.js`
- `client/src/pages/Configuracion.jsx`

## Si se corta la PC

- Reabrir esta carpeta: `C:\Users\Exe\.verdent\verdent-projects\modosabor1`
- Leer primero este archivo y despues `WHATSAPP-RENDER.md`
- Verificar `git status`
- Si hace falta clonar de nuevo: `https://github.com/juntosxelprogreso22-cell/modosabor1.git`
