import { apiJson } from './client.ts';
import type { MentionView } from './types.ts';

interface ReadHashResponse {
  readonly hash: string;
}

export async function linkAllMentions(
  targetRef: string,
  mentions: readonly MentionView[],
): Promise<void> {
  const paths = [...new Set(mentions.map((mention) => mention.sourcePath))];
  const sources = await Promise.all(
    paths.map(async (path) => {
      const read = await apiJson<ReadHashResponse>(
        `/api/read?ref=${encodeURIComponent(path)}&as=html`,
      );
      return { from: path, ifMatch: read.data.hash };
    }),
  );
  await apiJson('/api/mentions/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: targetRef, sources }),
  });
}
