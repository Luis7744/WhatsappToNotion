# WhatsApp → Notion Logger

Servicio Express escrito en TypeScript que recibe los webhooks de WhatsApp Cloud y crea una página en una base de datos de Notion por cada mensaje o imagen enviada a tu número.

## Requisitos previos

- Cuenta de [Meta for Developers](https://developers.facebook.com/) con la API de WhatsApp Cloud habilitada.
- Un **número de teléfono de WhatsApp Business** con su `phone_number_id` asociado (lo obtienes en el apartado *WhatsApp* de la app en Meta Developers).
- Base de datos en Notion con un campo título llamado `Name` (es el valor por defecto cuando creas una base desde Notion).
- Una integración interna en Notion con permisos de lectura/escritura sobre esa base de datos.

## Configuración rápida

1. Instala las dependencias

   ```bash
   npm install
   ```

2. Copia el fichero de entorno y rellena los valores

   ```bash
   cp .env.example .env
   ```

   | Variable | Descripción |
   | --- | --- |
   | `NOTION_TOKEN` | Token secreto de la integración de Notion |
   | `NOTION_DATABASE_ID` | ID de la base de datos donde se crearán las páginas |
   | `WHATSAPP_TOKEN` | Token de acceso de la API de WhatsApp (nivel *Permanent token*) |
   | `WHATSAPP_VERIFY_TOKEN` | Cadena que usarás para validar el webhook con Meta |
   | `WHATSAPP_PHONE_NUMBER_ID` | Identificador del número configurado en la API |
   | `PUBLIC_BASE_URL` | URL pública del servidor. Necesario para que Notion pueda descargar las imágenes |
   | `MEDIA_STORAGE_PATH` | (Opcional) Ruta en la que se guardarán las imágenes descargadas |

3. Levanta el servidor en modo desarrollo

   ```bash
   npm run dev
   ```

4. Exponlo públicamente (puedes usar [ngrok](https://ngrok.com/) u otra alternativa) y configura la URL en el panel de WhatsApp Cloud → **Configuration** → **Webhook**.

   - Endpoint de verificación e ingestión: `https://TU_DOMINIO/webhook`
   - Durante la verificación, Meta enviará una petición `GET` con tu `WHATSAPP_VERIFY_TOKEN`; el servidor responderá automáticamente si coincide.

5. Da acceso a la integración de Notion a la base de datos desde la UI de Notion (botón `Share` → `Invite` → selecciona la integración).

## ¿Cómo funciona?

- **GET /webhook** valida la suscripción del webhook frente a Meta.
- **POST /webhook** procesa cada mensaje entrante:
  - Mensajes de texto ⇒ se crea una página con el contenido en un bloque `quote` más metadatos.
  - Imágenes ⇒ se descarga el archivo, se publica bajo `/media` y se adjunta como bloque `image` (si `PUBLIC_BASE_URL` está definido). Se añaden detalles técnicos como el `sha256` y la ruta local.
- El servidor expone `/media` como carpeta estática para que Notion pueda recuperar las imágenes. Asegúrate de que tu URL pública sea accesible desde internet.

## Construir y ejecutar en producción

```bash
npm run build
npm start
```

El código compilado se deposita en `dist/`. Recuerda configurar un proceso de sistema (PM2, systemd, Docker, etc.) y habilitar HTTPS si se expone públicamente.

## Seguridad

- Guarda el fichero `.env` fuera del control de versiones.
- Renueva periódicamente el token de WhatsApp si no utilizas un *permanent token*.
- Restringe el acceso a `/media` si prefieres no publicar los archivos; en ese caso Notion no podrá incrustar las imágenes, pero aún tendrás la ruta local y el ID del medio dentro de la página creada.