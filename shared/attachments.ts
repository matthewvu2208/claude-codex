import { z } from 'zod';

/**
 * Files and images attached to a message. The app copies each into its own attachments folder
 * when it is added, so the original can move or change without breaking the conversation.
 * Images go to the agent as images; other files go as paths the agent reads with its tools.
 */
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Larger images are sent as files (Claude's image limit is about 5 MB). */
export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

export const AttachmentIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f-]{27}$/);

export const AttachmentSchema = z.object({
  id: AttachmentIdSchema,
  name: z.string().min(1).max(255),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
  kind: z.enum(['image', 'file']),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  xml: 'application/xml',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Images both agents can look at. */
export const INLINE_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function mimeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function kindFor(mime: string, size: number): Attachment['kind'] {
  return INLINE_IMAGE_MIMES.has(mime) && size <= MAX_INLINE_IMAGE_BYTES ? 'image' : 'file';
}

/** A file name safe on every system, keeping the extension. */
export function safeFileName(name: string): string {
  const cleaned = [...name]
    .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? '_' : c))
    .join('')
    .replace(/^\.+/, '')
    .trim()
    .slice(-120);
  return cleaned || 'file';
}

/** What the agent is told about attached files it should open itself. */
export function attachedFilesNote(files: { name: string; path: string }[]): string {
  if (files.length === 0) return '';
  return [
    'Attached files (read them with your file tools):',
    ...files.map((f) => `- ${f.name}: ${f.path}`),
  ].join('\n');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
