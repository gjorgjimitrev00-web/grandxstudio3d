import { z } from 'zod';
import {
  FRAME_FILE_MAX,
  FRAME_PHOTO_COUNTS,
  FRAME_SIZES,
  type FrameCrop,
  type FrameSize,
  type FrameTemplate,
} from './frame-artwork';

export type FrameDraftState = {
  template: FrameTemplate;
  size: FrameSize;
  paper: 'glossy' | 'matte';
  locale: 'mk' | 'en';
  fit: 'contain' | 'cover';
  orientation: 'portrait' | 'landscape';
  crops: Record<FrameTemplate, FrameCrop[]>;
  selected: number;
  names: string;
  date: string;
  caption: string;
  // Four shared poster slots and a separate fifth slot for finished artwork.
  files: (File | null)[];
};

const templates = Object.keys(FRAME_PHOTO_COUNTS) as [FrameTemplate, ...FrameTemplate[]];
const sizes = Object.keys(FRAME_SIZES) as [FrameSize, ...FrameSize[]];
const crop = z.object({
  zoom: z.number().min(1).max(3),
  panX: z.number().min(0).max(1),
  panY: z.number().min(0).max(1),
});
const storedPhoto = z.object({
  name: z.string(),
  lastModified: z.number().int(),
  blob: z.custom<Blob>(
    (value) =>
      value instanceof Blob &&
      value.size > 0 &&
      value.size <= FRAME_FILE_MAX &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(value.type),
  ),
});
const snapshot = z
  .object({
    version: z.literal(1),
    template: z.enum(templates),
    size: z.enum(sizes),
    paper: z.enum(['glossy', 'matte']),
    locale: z.enum(['mk', 'en']),
    fit: z.enum(['contain', 'cover']),
    orientation: z.enum(['portrait', 'landscape']),
    crops: z.record(z.enum(templates), z.array(crop).max(4)),
    selected: z.number().int().min(0),
    // Preserve unfinished text exactly, even when it needs editing before printing.
    names: z.string().max(60),
    date: z.string().max(32),
    caption: z.string().max(100),
    files: z.array(storedPhoto.nullable()).length(5),
  })
  .refine(
    (state) =>
      state.selected < FRAME_PHOTO_COUNTS[state.template] &&
      templates.every((template) => state.crops[template].length === FRAME_PHOTO_COUNTS[template]),
  );

const infoSchema = z.object({ revision: z.uuid(), savedAt: z.number().int().positive() });
export type FrameDraftInfo = z.infer<typeof infoSchema>;
export class FrameDraftConflictError extends Error {
  constructor() {
    super('The saved draft has changed.');
    this.name = 'FrameDraftConflictError';
  }
}

export function serializeFrameDraft({ files, ...fields }: FrameDraftState) {
  return snapshot.parse({
    ...fields,
    version: 1,
    files: files.map(
      (file) => file && { name: file.name, lastModified: file.lastModified, blob: file },
    ),
  });
}

export function deserializeFrameDraft(value: unknown): FrameDraftState {
  const { version: _, files, ...state } = snapshot.parse(value);
  return {
    ...state,
    files: files.map(
      (photo) =>
        photo &&
        new File([photo.blob], photo.name, {
          type: photo.blob.type,
          lastModified: photo.lastModified,
        }),
    ),
  };
}

// Keeping the revision separate lets the editor check for a draft without reading photos.
const STORE = 'draft';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('grandxstudio-frame-drafts', 1);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Draft storage is blocked.'));
    };
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
  });
}

// Resolve writes only when both the photos and the revision have committed.
async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, abort: (reason: unknown) => void) => () => T,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let failure: unknown;
      let result: () => T;
      const abort = (reason: unknown) => {
        failure = reason;
        tx.abort();
      };
      tx.onabort = () => reject(failure || tx.error || new Error('Draft transaction aborted.'));
      tx.oncomplete = () => {
        try {
          resolve(result());
        } catch (error) {
          reject(error);
        }
      };
      try {
        result = operation(tx.objectStore(STORE), abort);
      } catch (error) {
        abort(error);
      }
    });
  } finally {
    db.close();
  }
}

function parseInfo(value: unknown) {
  return value === undefined ? null : infoSchema.parse(value);
}

export function readFrameDraftInfo(): Promise<FrameDraftInfo | null> {
  return transact('readonly', (store) => {
    const info = store.get('info');
    return () => parseInfo(info.result);
  });
}

export function loadFrameDraft(): Promise<(FrameDraftInfo & { state: FrameDraftState }) | null> {
  return transact('readonly', (store) => {
    const info = store.get('info');
    const state = store.get('state');
    return () => {
      const current = parseInfo(info.result);
      return current && { ...current, state: deserializeFrameDraft(state.result) };
    };
  });
}

// The revision check and the mutation run in the same serialized read/write transaction.
function changeDraft<T>(expectedRevision: string | null, change: (store: IDBObjectStore) => T) {
  return transact<T>('readwrite', (store, abort) => {
    let result: T;
    const info = store.get('info');
    info.onsuccess = () => {
      try {
        if ((parseInfo(info.result)?.revision ?? null) !== expectedRevision)
          throw new FrameDraftConflictError();
        result = change(store);
      } catch (error) {
        abort(error);
      }
    };
    return () => result;
  });
}

export async function saveFrameDraft(state: FrameDraftState, expectedRevision: string | null) {
  const record = serializeFrameDraft(state);
  const info: FrameDraftInfo = { revision: crypto.randomUUID(), savedAt: Date.now() };
  return changeDraft(expectedRevision, (store) => {
    store.put(record, 'state');
    store.put(info, 'info');
    return info;
  });
}

export function deleteFrameDraft(expectedRevision: string) {
  return changeDraft(expectedRevision, (store) => {
    store.delete('state');
    store.delete('info');
  });
}
