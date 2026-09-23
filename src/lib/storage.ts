import sharp from 'sharp';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './security';
const keyPattern =
  /^(images\/[a-f0-9-]+-(400|800|1600)\.webp|private\/[a-f0-9-]+\.(stl|3mf|step|stp|obj|zip|pdf|png|jpg|jpeg))$/;
function localRoot() {
  const root = process.env.LOCAL_MEDIA_ROOT;
  if (!root || !path.isAbsolute(root) || path.resolve(root).startsWith(process.cwd() + path.sep))
    throw new HttpError(503, 'Persistent storage is not configured.');
  if (process.env.NODE_ENV === 'production')
    throw new HttpError(503, 'Configure the persistent Hostinger media bridge for production.');
  return root;
}
async function bridge(
  action: 'put' | 'get' | 'delete',
  key: string,
  body: Buffer = Buffer.alloc(0),
) {
  const endpoint = process.env.MEDIA_UPLOAD_URL;
  const secret = process.env.MEDIA_UPLOAD_SECRET;
  if (!endpoint || new URL(endpoint).protocol !== 'https:' || !secret || secret.length < 32)
    throw new HttpError(503, 'Persistent media storage is not configured.');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash('sha256').update(body).digest('hex');
  const signature = createHmac('sha256', secret)
    .update(`${action}\n${key}\n${timestamp}\n${digest}`)
    .digest('hex');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-GX-Action': action,
      'X-GX-Key': key,
      'X-GX-Time': timestamp,
      'X-GX-Signature': signature,
    },
    body: new Uint8Array(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) throw new HttpError(502, 'Media storage is temporarily unavailable.');
  return response;
}
export async function putFile(key: string, body: Buffer) {
  if (!keyPattern.test(key)) throw new HttpError(400, 'Invalid storage key.');
  if (process.env.MEDIA_DRIVER === 'local') {
    const target = path.join(localRoot(), key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, body, { flag: 'wx', mode: 0o600 });
  } else await bridge('put', key, body);
}
export async function getFile(key: string) {
  if (!keyPattern.test(key)) throw new HttpError(404, 'File not found.');
  if (process.env.MEDIA_DRIVER === 'local') return readFile(path.join(localRoot(), key));
  return Buffer.from(await (await bridge('get', key)).arrayBuffer());
}
export async function deleteFile(key: string) {
  if (!keyPattern.test(key)) return;
  if (process.env.MEDIA_DRIVER === 'local') {
    await unlink(path.join(localRoot(), key)).catch(() => {});
  } else await bridge('delete', key);
}
export function publicUrl(key: string) {
  return process.env.MEDIA_DRIVER === 'local'
    ? `/api/media/${key}`
    : `${process.env.MEDIA_BASE_URL?.replace(/\/$/, '')}/${key}`;
}
export async function optimizeImage(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  const types: Record<string, string[]> = {
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.webp': ['image/webp'],
  };
  if (!types[extension]?.includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new HttpError(400, 'Use a JPEG, PNG or WebP image smaller than 10 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 40000000, failOn: 'error' }).metadata();
  } catch {
    throw new HttpError(400, 'Invalid image content.');
  }
  if (
    !['jpeg', 'png', 'webp'].includes(meta.format) ||
    !meta.width ||
    !meta.height ||
    (meta.pages ?? 1) > 1
  )
    throw new HttpError(400, 'Unsupported image content.');
  if (
    (meta.format === 'jpeg' && !['.jpg', '.jpeg'].includes(extension)) ||
    (meta.format === 'png' && extension !== '.png') ||
    (meta.format === 'webp' && extension !== '.webp')
  )
    throw new HttpError(400, 'Image extension does not match content.');
  const id = randomUUID();
  const keys: string[] = [];
  let width = 0,
    height = 0;
  try {
    for (const size of [400, 800, 1600]) {
      const { data, info } = await sharp(input, { limitInputPixels: 40000000, failOn: 'error' })
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      const key = `images/${id}-${size}.webp`;
      await putFile(key, data);
      keys.push(key);
      if (size === 1600) {
        width = info.width;
        height = info.height;
      }
    }
  } catch (e) {
    await Promise.allSettled(keys.map(deleteFile));
    throw e;
  }
  return {
    filename: id,
    url: publicUrl(keys[2]),
    listingUrl: publicUrl(keys[1]),
    thumbnailUrl: publicUrl(keys[0]),
    width,
    height,
  };
}
export async function storePrivateFile(file: File) {
  const extension = path.extname(file.name).slice(1).toLowerCase();
  if (
    !['stl', '3mf', 'step', 'stp', 'obj', 'zip', 'pdf', 'png', 'jpg', 'jpeg'].includes(extension) ||
    file.size < 1 ||
    file.size > 20 * 1024 * 1024
  )
    throw new HttpError(400, 'Unsupported file or file larger than 20 MB.');
  const buffer = Buffer.from(await file.arrayBuffer());
  const head = buffer.subarray(0, 1024).toString('utf8');
  if (
    ['zip', '3mf'].includes(extension) &&
    !buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
  )
    throw new HttpError(400, 'Invalid archive.');
  if (extension === 'pdf' && !head.startsWith('%PDF-')) throw new HttpError(400, 'Invalid PDF.');
  if (['step', 'stp'].includes(extension) && !head.includes('ISO-10303-21'))
    throw new HttpError(400, 'Invalid STEP file.');
  if (extension === 'stl') {
    const binary = buffer.length >= 84 && buffer.readUInt32LE(80) * 50 + 84 === buffer.length;
    if (!binary && !/^\s*solid\b/i.test(head)) throw new HttpError(400, 'Invalid STL file.');
  }
  if (extension === 'obj' && !/^\s*(#|v\s|o\s|g\s|mtllib\s)/m.test(head))
    throw new HttpError(400, 'Invalid OBJ file.');
  if (['png', 'jpg', 'jpeg'].includes(extension)) {
    try {
      const m = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
      if (!['png', 'jpeg'].includes(m.format)) throw Error();
    } catch {
      throw new HttpError(400, 'Invalid reference image.');
    }
  }
  // Private files are never executed, extracted, or rendered inline. Administrator downloads are attachments.
  const key = `private/${randomUUID()}.${extension}`;
  await putFile(key, buffer);
  return {
    key,
    originalName: path
      .basename(file.name)
      .replace(/[^\p{L}\p{N} ._-]/gu, '_')
      .slice(0, 180),
    mimeType: 'application/octet-stream',
    size: buffer.length,
  };
}
