import express from 'express';
import fs from 'node:fs/promises';
import { config } from './config';
import { downloadAndStoreMedia, extractMessages } from './whatsapp';
import type { WhatsAppImageMessage, WhatsAppMessage, WhatsAppTextMessage } from './whatsapp';
import { logToNotion } from './notion';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

async function ensureMediaDirectory(): Promise<void> {
  await fs.mkdir(config.mediaStoragePath, { recursive: true });
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function buildMetadataBlock(message: WhatsAppMessage): BlockObjectRequest {
  const lines: string[] = [
    `Remitente: ${message.contact?.profileName ?? 'Sin nombre'} (${message.from})`,
    `Tipo: ${message.type}`,
    `Timestamp: ${formatTimestamp(message.timestamp)}`
  ];

  return {
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: lines.join('\n')
          }
        }
      ]
    }
  };
}

function buildTextBlocks(message: WhatsAppTextMessage): BlockObjectRequest[] {
  const details: string[] = [
    `ID del mensaje: ${message.id}`,
    `Longitud: ${message.text.length} caracteres`
  ];

  return [
    {
      type: 'quote',
      quote: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: message.text
            }
          }
        ]
      }
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: details.join('\n')
            }
          }
        ]
      }
    },
    buildMetadataBlock(message)
  ];
}

async function buildImageBlocks(message: WhatsAppImageMessage): Promise<BlockObjectRequest[]> {
  const blocks: BlockObjectRequest[] = [];

  const storedMedia = await downloadAndStoreMedia(message.imageId);

  if (storedMedia?.publicUrl) {
    blocks.push({
      type: 'image',
      image: {
        type: 'external',
        external: {
          url: storedMedia.publicUrl
        },
        caption: message.caption
          ? [
              {
                type: 'text',
                text: {
                  content: message.caption
                }
              }
            ]
          : []
      }
    });
  }

  if (message.caption && !storedMedia?.publicUrl) {
    blocks.push({
      type: 'quote',
      quote: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: message.caption
            }
          }
        ]
      }
    });
  }

  const details: string[] = [
    `ID del medio: ${message.imageId}`,
    `Hash SHA256: ${message.sha256 ?? 'N/D'}`,
    storedMedia?.publicUrl ? `URL pública: ${storedMedia.publicUrl}` : 'El servidor no dispone de URL pública para el archivo.',
    `Ruta local: ${storedMedia?.filePath ?? 'N/D'}`
  ];

  blocks.push({
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: details.join('\n')
          }
        }
      ]
    }
  });

  blocks.push(buildMetadataBlock(message));

  return blocks;
}

async function handleMessage(message: WhatsAppMessage): Promise<void> {
  const defaultTitle = `${message.type === 'text' ? 'Mensaje' : 'Imagen'} de ${
    message.contact?.profileName ?? message.from
  }`;
  const title = defaultTitle.length > 120 ? `${defaultTitle.slice(0, 117)}...` : defaultTitle;

  if (message.type === 'text') {
    const blocks = buildTextBlocks(message);
    await logToNotion({
      title,
      blocks
    });
    return;
  }

  if (message.type === 'image') {
    const blocks = await buildImageBlocks(message);
    await logToNotion({
      title,
      blocks
    });
  }
}

async function main(): Promise<void> {
  await ensureMediaDirectory();

  const app = express();

  app.use(express.json({ limit: '20mb' }));
  app.use('/media', express.static(config.mediaStoragePath));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsappVerifyToken && typeof challenge === 'string') {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  app.post('/webhook', async (req, res) => {
    const messages = extractMessages(req.body);

    if (messages.length === 0) {
      return res.sendStatus(200);
    }

    for (const message of messages) {
      try {
        await handleMessage(message);
      } catch (error) {
        console.error('Error al procesar un mensaje', error);
      }
    }

    return res.sendStatus(200);
  });

  app.listen(config.port, () => {
    console.log(`Servidor escuchando en el puerto ${config.port}`);
  });
}

main().catch((error) => {
  console.error('Error crítico al iniciar la aplicación', error);
  process.exit(1);
});
