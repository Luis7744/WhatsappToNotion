import { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';
import { config } from './config';

const notion = new Client({ auth: config.notionToken });

export interface NotionLogEntry {
  title: string;
  blocks: BlockObjectRequest[];
}

export async function logToNotion(entry: NotionLogEntry): Promise<void> {
  await notion.pages.create({
    parent: { database_id: config.notionDatabaseId },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: entry.title
            }
          }
        ]
      }
    },
    children: entry.blocks
  });
}
