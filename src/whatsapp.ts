import axios from 'axios';
import type { AxiosInstance } from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { lookup as lookupMimeExtension } from 'mime-types';
import { config } from './config';

export type SupportedMessageType = 'text' | 'image';

export interface WhatsAppContact {
  waId: string;
  profileName?: string | undefined;
}

export interface WhatsAppMessageBase {
  id: string;
  from: string;
  timestamp: number;
  contact?: WhatsAppContact;
  type: SupportedMessageType;
}

export interface WhatsAppTextMessage extends WhatsAppMessageBase {
  type: 'text';
  text: string;
}

export interface WhatsAppImageMessage extends WhatsAppMessageBase {
  type: 'image';
  caption?: string | undefined;
  imageId: string;
  mimeType?: string | undefined;
  sha256?: string | undefined;
}

export type WhatsAppMessage = WhatsAppTextMessage | WhatsAppImageMessage;

export interface StoredMedia {
  mediaId: string;
  filePath: string;
  mimeType: string;
  filename: string;
  publicUrl?: string | undefined;
}

const graphApi: AxiosInstance = axios.create({
  baseURL: 'https://graph.facebook.com/v20.0',
  headers: {
    Authorization: `Bearer ${config.whatsappToken}`
  }
});

function asNumberTimestamp(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    throw new Error(`Timestamp inválido recibido: ${value}`);
  }
  return numeric;
}

interface RawWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          image?: {
            id?: string;
            caption?: string;
            mime_type?: string;
            sha256?: string;
          };
        }>;
      };
    }>;
  }>;
}

export function extractMessages(body: RawWebhookBody): WhatsAppMessage[] {
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return [];
  }

  const messages: WhatsAppMessage[] = [];

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages' || !change.value) {
        continue;
      }
      if (change.value.metadata?.phone_number_id !== config.whatsappPhoneNumberId) {
        continue;
      }

      const contactsMap = new Map<string, WhatsAppContact>();
      for (const contact of change.value.contacts ?? []) {
        if (!contact.wa_id) continue;
        const contactInfo: WhatsAppContact = {
          waId: contact.wa_id
        };
        if (contact.profile?.name) {
          contactInfo.profileName = contact.profile.name;
        }
        contactsMap.set(contact.wa_id, contactInfo);
      }

      for (const message of change.value.messages ?? []) {
        if (!message.id || !message.from || !message.type || !message.timestamp) {
          continue;
        }

        const timestamp = asNumberTimestamp(message.timestamp);
        const contact = contactsMap.get(message.from);

        if (message.type === 'text' && message.text?.body) {
          const textMessage: WhatsAppTextMessage = contact
            ? {
                id: message.id,
                from: message.from,
                timestamp,
                type: 'text',
                contact,
                text: message.text.body
              }
            : {
                id: message.id,
                from: message.from,
                timestamp,
                type: 'text',
                text: message.text.body
              };
          messages.push(textMessage);
        }

        if (message.type === 'image' && message.image?.id) {
          const imageMessage: WhatsAppImageMessage = contact
            ? {
                id: message.id,
                from: message.from,
                timestamp,
                type: 'image',
                contact,
                imageId: message.image.id
              }
            : {
                id: message.id,
                from: message.from,
                timestamp,
                type: 'image',
                imageId: message.image.id
              };

          if (message.image.caption) {
            imageMessage.caption = message.image.caption;
          }
          if (message.image.mime_type) {
            imageMessage.mimeType = message.image.mime_type;
          }
          if (message.image.sha256) {
            imageMessage.sha256 = message.image.sha256;
          }

          messages.push(imageMessage);
        }
      }
    }
  }

  return messages;
}

async function fetchMediaMetadata(mediaId: string): Promise<{ url: string; mime_type: string } | null> {
  try {
    const response = await graphApi.get<{ url: string; mime_type: string }>(`/${mediaId}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('No se pudo obtener la metadata del medio', error.response?.data ?? error.message);
    } else {
      console.error('Error desconocido al obtener metadata del medio', error);
    }
    return null;
  }
}

export async function downloadAndStoreMedia(mediaId: string): Promise<StoredMedia | null> {
  const metadata = await fetchMediaMetadata(mediaId);
  if (!metadata?.url) {
    return null;
  }

  const downloadHeaders = {
    Authorization: `Bearer ${config.whatsappToken}`
  };

  try {
    const response = await axios.get<ArrayBuffer>(metadata.url, {
      headers: downloadHeaders,
      responseType: 'arraybuffer'
    });

    await fs.mkdir(config.mediaStoragePath, { recursive: true });

    const mimeType = metadata.mime_type ?? (typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined) ?? 'application/octet-stream';
    const mimeExtension = lookupMimeExtension(mimeType);
    const extension = mimeExtension ? `.${mimeExtension}` : '';
    const filename = `${mediaId}${extension}`;
    const filePath = path.join(config.mediaStoragePath, filename);

    await fs.writeFile(filePath, Buffer.from(response.data));

    const publicUrl = config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/$/, '')}/media/${filename}` : undefined;

    const stored: StoredMedia = {
      mediaId,
      filePath,
      mimeType,
      filename
    };

    if (publicUrl) {
      stored.publicUrl = publicUrl;
    }

    return stored;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('No se pudo descargar el medio', error.response?.data ?? error.message);
    } else {
      console.error('Error desconocido al descargar el medio', error);
    }
    return null;
  }
}
