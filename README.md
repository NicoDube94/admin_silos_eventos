# Silos Eventos

Panel de administración de cumpleaños. El frontend usa React + Vite; la API local usa Express y MySQL/TiDB.

## Desarrollo local

Requisitos: Node.js 22.12 o posterior y una base TiDB/MySQL accesible.

1. Si `.env` todavía no existe, créalo desde `.env.example` con `Copy-Item .env.example .env` en PowerShell; si ya existe, edítalo sin reemplazarlo.
2. Completa `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` con los datos de TiDB Cloud. Conserva `DB_SSL=true` para TiDB.
3. Importa `db_salon_eventos.sql` en la base.
4. Ejecuta `npm run dev:full` y abre `http://127.0.0.1:5173/`.

El comando inicia la API en el puerto 3001 y Vite en el 5173. Vite reenvía `/api` a la API local. También puedes ejecutar `npm run api` y `npm run dev` en terminales separadas.

En bases creadas antes de estas funciones, aplica las migraciones SQL numeradas una sola vez y en orden antes de iniciar la API actualizada. La migración `004_single_active_template_per_notice.sql` conserva activa la plantilla de ID más alto de cada aviso y desactiva las anteriores; `005_soft_delete_templates.sql` agrega la baja lógica de plantillas; `006_whatsapp_message_statuses.sql` guarda estados y errores de Meta; `007_notification_message_ids.sql` relaciona los WAMID con el historial. El motor genera avisos pendientes al iniciar la API y cada día a las 09:00 de `America/Argentina/Buenos_Aires`. Puedes cambiar el horario con `NOTIFICATION_CRON` y `NOTIFICATION_TIMEZONE` en `.env`. El tema elegido se guarda en la base y se comparte al abrir la aplicación desde otro navegador; si la API está desconectada, queda guardado localmente. Las plantillas se asignan al aviso 1, 2 o 3 y el icono de notificaciones muestra solo avisos enviados junto con una copia del mensaje utilizado.

El dump no contiene clientes ni plantillas de ejemplo. Los archivos `src/mockData.json` y `src/mockSettings.json` solo se muestran como vista de demostración mientras la API está desconectada; no se insertan automáticamente en TiDB.

## API

- `GET /api/health`: estado de conexión con la base.
- `GET /api/whatsapp/statuses`: últimos 100 estados de mensajes recibidos de Meta, incluidos errores de entrega.
- `GET /api/clients`: clientes activos y estado agregado de avisos.
- `POST /api/clients` y `PUT /api/clients/:id`: alta y edición de clientes.
- `PATCH /api/clients/:id/deactivate`: baja lógica (`activo = 0`); no hay borrado físico.
- `GET /api/settings` y `PUT /api/settings`: parámetros del sistema.
- `GET /api/templates`, `POST /api/templates`, `PUT /api/templates/:id` y `PATCH /api/templates/:id/active`: gestión de plantillas.

Las consultas usan parámetros y la API valida las entradas. Las credenciales se leen desde `.env`, ignorado por Git; no las agregues al repositorio.

### Prueba de WhatsApp

Configura `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_TO` en `.env`; el destino debe incluir el código de país. Con la API iniciada, envía un mensaje de prueba solo a `WHATSAPP_TO`:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/whatsapp/test -ContentType 'application/json' -Body '{"mensaje":"Prueba de Silos Eventos"}'
```

Para enviar la plantilla aprobada configurada como `PLANTILLA_WHATSAPP` al mismo destino, pasa los dos parámetros que requiere su cuerpo y una imagen HTTPS accesible por Meta para el encabezado:

```powershell
$body = @{ parameters = @('Prueba', 'Prueba'); headerImage = @{ link = 'https://tu-dominio.example/imagen.jpg' } } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/whatsapp/test-template -ContentType 'application/json' -Body $body
```

La plantilla debe estar aprobada en el locale configurado por `WHATSAPP_TEMPLATE_LANGUAGE` (por defecto `es_AR`). Un clic en respuesta rápida se recibe mediante el webhook documentado abajo. Dentro de la ventana de atención de 24 horas, la respuesta del cliente permite enviar texto libre; fuera de ella se requiere una plantilla aprobada. El envío automático de pendientes queda desactivado hasta integrar las plantillas con el esquema de ofertas y procesar las respuestas.

### Webhook de respuestas rápidas

La URL de callback de la API es `/api/webhooks/whatsapp`. Meta necesita una URL pública HTTPS, por ejemplo `https://tu-servicio.onrender.com/api/webhooks/whatsapp`; `127.0.0.1` no es accesible desde Meta. En Render no necesitas ngrok. Configura en el servicio las variables `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` y en Meta utiliza el mismo token de verificación. Suscribe el campo `messages`; los cambios de entrega (`sent`, `delivered`, `read`, `failed`) llegan en ese webhook y quedan en `whatsapp_message_statuses`. Puedes consultarlos en `GET /api/whatsapp/statuses`.

En Meta Developers, en el webhook de WhatsApp, usa esa URL y el mismo `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Suscribe el campo `messages` y completa la verificación. Cuando el cliente pulse `Quiero saber más`, la API busca la oferta activa llamada `aviso test`, reemplaza `{{nombre_tutor}}` y `{{nombre_cumpleanero}}`, y envía su cuerpo como texto libre dentro de la ventana de atención iniciada por el cliente. Al pulsar `No, Gracias`, responde: `Gracias por avisarnos. ¡Que tengas un hermoso día! Si cambias de opinión, puedes comunicarte al 2657287394.` Los eventos repetidos no se procesan dos veces.

### Despliegue en Render

El archivo `render.yaml` configura un único Web Service para servir el frontend compilado y la API en el mismo dominio. En Render, crea el servicio desde el Blueprint del repositorio y completa las variables marcadas como secretas con los valores de tu entorno. Render asigna `PORT`; no lo definas manualmente. Importa la base existente y aplica las migraciones que todavía no tenga antes de usar la app. Configura en Meta como callback `https://<dominio-render>/api/webhooks/whatsapp`, el mismo `WHATSAPP_WEBHOOK_VERIFY_TOKEN` del servicio y la suscripción al campo `messages`.

El Blueprint limita el envío de prueba al 4 de octubre de 2026, 09:00 de Argentina, y a los IDs de cliente 1 y 60001. Utiliza `PLANTILLA_WHATSAPP` y `silos_1.jpg`, y envía esa misma plantilla aprobada al teléfono administrativo por cada cliente procesado. Al finalizar la fecha, la protección impide nuevos envíos. Un Render Free puede dormir y ejecutar al despertar, por lo que no garantiza el minuto exacto de las 09:00.

El servicio API no incluye autenticación de administrador. Antes de usar datos reales en un servicio público, agrega autenticación o protege el acceso mediante un proxy de identidad.

La API debe estar ejecutándose en el servidor que corresponde al dominio público. Para una prueba local se necesita un túnel HTTPS, por ejemplo Cloudflare Tunnel o ngrok; la URL resultante debe conservar el sufijo `/api/webhooks/whatsapp`.

Para usar ngrok en desarrollo:

1. Crea un authtoken en el dashboard de ngrok y agrega `NGROK_AUTHTOKEN` a `.env`.
2. En una terminal inicia la API con `npm run api`.
3. En otra terminal ejecuta `npm run tunnel`.
4. Copia la URL que imprime el comando, agregando `/api/webhooks/whatsapp`, en la configuración del webhook de Meta.

El dominio gratuito de ngrok puede cambiar cada vez que se reinicia el túnel; actualiza la URL en Meta cuando cambie.

## Verificación

```powershell
npm run test
npm run lint
npm run build
```

