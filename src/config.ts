import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

const requiredEnvVars = {
  NOTION_TOKEN: process.env.NOTION_TOKEN,
  NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID
};

const missing = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Faltan variables de entorno obligatorias: ${missing.join(', ')}. ` +
      'Revise su fichero .env antes de iniciar el servidor.'
  );
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  notionToken: requiredEnvVars.NOTION_TOKEN as string,
  notionDatabaseId: requiredEnvVars.NOTION_DATABASE_ID as string,
  whatsappToken: requiredEnvVars.WHATSAPP_TOKEN as string,
  whatsappVerifyToken: requiredEnvVars.WHATSAPP_VERIFY_TOKEN as string,
  whatsappPhoneNumberId: requiredEnvVars.WHATSAPP_PHONE_NUMBER_ID as string,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  mediaStoragePath: process.env.MEDIA_STORAGE_PATH
    ? path.resolve(process.env.MEDIA_STORAGE_PATH)
    : path.join(process.cwd(), 'storage', 'media')
};
