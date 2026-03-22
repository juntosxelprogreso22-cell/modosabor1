# Estado actual - 2026-03-22

## Resumen rapido

- Proyecto revisado: `C:\Users\Exe\.verdent\verdent-projects\modosabor1`
- Branch: `main`
- Ultimo commit en `origin/main`: `f08e444` - `Agregar ejemplo de variables para WhatsApp en Render`
- Hay cambios locales sin commit:
  - `WHATSAPP-RENDER.md`
  - `server/utils/whatsapp.js`
  - `ESTADO-RENDER-WHATSAPP-2026-03-21.md` sigue sin trackear

## Que se reviso hoy

- Estructura general del frontend y backend
- Historial reciente de git
- Guias existentes:
  - `PROYECTO-MODO-SABOR.md`
  - `GO-LIVE-CHECKLIST.md`
  - `WHATSAPP-RENDER.md`
  - `ESTADO-RENDER-WHATSAPP-2026-03-21.md`
- Modulo WhatsApp:
  - `server/routes/whatsapp.js`
  - `server/routes/configuracion.js`
  - `server/utils/runtimeConfig.js`
  - `server/utils/whatsapp.js`
  - `server/utils/whatsappBot.js`
  - `server/utils/openaiWhatsAppAgent.js`
- Backups locales en `server/data/backups`

## Mapa real del proyecto

### Frontend

- Stack: React + Vite + Tailwind
- Pantallas activas detectadas:
  - web publica
  - seguimiento de pedido
  - panel rider
  - dashboard admin
  - TPV
  - pedidos
  - caja
  - KDS
  - mesas
  - delivery
  - productos
  - categorias
  - clientes
  - reportes
  - configuracion
  - WhatsApp inbox
  - usuarios
  - cuenta
  - personal

### Backend

- Stack: Node + Express + SQLite
- Rutas activas:
  - auth
  - categorias
  - productos
  - pedidos
  - clientes
  - configuracion
  - reportes
  - repartidores
  - personal
  - caja
  - whatsapp
- Extras importantes:
  - sockets
  - seed inicial del menu
  - backups automáticos
  - impresion A6
  - borradores de pedido por WhatsApp
  - agente IA con OpenAI para chat

## Estado confirmado hoy

- La build del frontend pasa:
  - `npm run build` en `client` termino OK
- El proyecto tiene backups automáticos activos en SQLite.
- Existen backups locales recientes en `server/data/backups`.
- El flujo de configuracion de WhatsApp ya esta implementado:
  - diagnostico
  - prueba de envio
  - webhook
  - inbox
  - bot basico
  - agente IA
- El error `131030` ya estaba bien encaminado en el codigo y en la guia:
  - no apunta a Render
  - no apunta a token invalido
  - no apunta a Phone Number ID invalido
- Se reforzo el flujo de configuracion de WhatsApp:
  - el backend ahora devuelve checks de produccion
  - el backend devuelve ayuda concreta cuando Meta responde `131030`
  - el panel muestra destino de prueba, webhook, proximos pasos y resultado del ultimo envio
  - `server/.env.example` ya incluye `WHATSAPP_TEST_DESTINO`

## Bloqueo actual de WhatsApp

Si en `Configuracion -> WhatsApp -> Enviar prueba` aparece:

```text
(#131030) Recipient phone number not in allowed list
```

la causa mas probable es esta:

- Meta todavia considera ese envio como prueba de Cloud API
- el numero destino no esta agregado en la lista permitida de prueba

## Como destrabarlo

1. Entrar a Meta Developers.
2. Ir a WhatsApp -> API Setup.
3. Buscar la seccion `To` o destinatarios de prueba.
4. Agregar y verificar el numero destino.
5. Repetir la prueba desde el panel.

Si `Probar WhatsApp` da todos los checks en `OK`, pero `Enviar prueba` falla con `131030`, el problema esta casi seguro en Meta y no en Render.

## Riesgo local importante detectado

El puerto `3001` no esta libre en esta PC.

Hoy se detecto un proceso Node escuchando en `3001` con este comando:

```text
"C:\Program Files\nodejs\node.exe" --input-type=module -e "import { readStore } from './backend/src/utils/store.js'; import './backend/src/server.js';"
```

Eso significa:

- cuando se prueba `http://127.0.0.1:3001`, puede responder otro proyecto
- el `GET /api/health` que vimos en local no coincide con `server/index.js` de este repo
- si queremos probar este proyecto localmente, hay que:
  - cerrar ese proceso ajeno
  - o levantar `modosabor1` en otro puerto

## Riesgo de produccion a no olvidar

- El proyecto usa SQLite local en `server/data/modosabor.db`.
- En Render, si el backend no tiene disco persistente o estrategia de backup, se puede perder estado en reinicios o redeploys.
- Antes de depender de produccion real conviene confirmar:
  - disco persistente
  - backups descargables
  - restauracion probada

## Archivos para abrir primero si se corta la PC

1. `ESTADO-ACTUAL-2026-03-22.md`
2. `ESTADO-RENDER-WHATSAPP-2026-03-21.md`
3. `WHATSAPP-RENDER.md`
4. `PROYECTO-MODO-SABOR.md`

## Comandos utiles para retomar

```powershell
cd C:\Users\Exe\.verdent\verdent-projects\modosabor1
git status --short --branch
git log --oneline --decorate -n 12
Get-ChildItem server\data\backups | Sort-Object LastWriteTime -Descending
```

## Proximo punto recomendado al retomar

1. Resolver la lista permitida de Meta para la prueba de WhatsApp.
2. Confirmar si Render tiene disco persistente para SQLite.
3. Decidir si seguimos con WhatsApp en produccion o volvemos a prioridad operativa:
   impresion A6, TPV, flujo pedido -> cobro -> entrega.
