import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, resolve } from 'node:path';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
};

const KEY_PATTERN = /^[a-z0-9-]+\.(png|jpg|webp)$/;

function avatarsDir(): string {
  return process.env.AVATARS_DIR ?? resolve(process.cwd(), 'uploads/avatars');
}

export function isAvatarContentType(contentType: string | undefined): boolean {
  return contentType !== undefined && contentType in EXTENSIONS;
}

export function isValidAvatarKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function avatarMime(key: string): string | null {
  return MIME_BY_EXTENSION[extname(key).slice(1)] ?? null;
}

export async function saveAvatar(contentType: string, data: Buffer): Promise<string> {
  const extension = EXTENSIONS[contentType];
  if (!extension) {
    throw new Error(`Неподдерживаемый тип изображения: ${contentType}`);
  }
  const key = `${randomUUID()}.${extension}`;
  const dir = avatarsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), data);
  return key;
}

export async function readAvatar(key: string): Promise<Buffer | null> {
  if (!isValidAvatarKey(key)) return null;
  try {
    return await readFile(join(avatarsDir(), key));
  } catch {
    return null;
  }
}

export async function removeAvatar(key: string): Promise<void> {
  if (!isValidAvatarKey(key)) return;
  await rm(join(avatarsDir(), key), { force: true });
}
