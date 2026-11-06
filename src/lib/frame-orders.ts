import { createHash, randomUUID } from 'node:crypto';
import { FrameAssetKind, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { FRAME_FILE_MAX, FRAME_FILES_MAX, frameDesignSchema } from './frame-artwork';
import { FrameArtworkError, renderFrameArtwork } from './frame-render';
import { FRAME_PAPERS, frameUnitPrice } from './frame-price-rules';
import { getFramePrices } from './frame-pricing';
import { HttpError, limitedForm, rateLimit } from './security';

const MiB = 1024 * 1024;
const chunkSize = 512 * 1024;

const customerFields = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(191).toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d ()-]{7,32}$/)
    .refine((s) => s.replace(/\D/g, '').length >= 7),
  quantity: z.coerce.number().int().min(1).max(20),
  notes: z.string().trim().max(2000),
  paper: z.enum(FRAME_PAPERS),
  expectedUnitPrice: z
    .string()
    .regex(/^(?:|0|[1-9]\d{0,7})$/)
    .transform((v) => (v === '' ? null : Number(v))),
  consent: z.literal('true'),
  website: z.literal(''),
  idempotencyKey: z.uuid(),
});

async function parseSubmission(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
    throw new HttpError(415, 'Send the photos as a multipart upload.');
  }
  let form: FormData;
  try {
    form = await limitedForm(request, FRAME_FILES_MAX + 64 * 1024);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The upload could not be read.');
  }
  const fields = customerFields.parse({
    name: form.get('name'),
    email: form.get('email'),
    phone: form.get('phone'),
    quantity: form.get('quantity') ?? '1',
    notes: form.get('notes') ?? '',
    paper: form.get('paper'),
    expectedUnitPrice: form.get('expectedUnitPrice'),
    consent: form.get('consent'),
    website: form.get('website') ?? '',
    idempotencyKey: form.get('idempotencyKey'),
  });
  const rawDesign = form.get('design');
  if (typeof rawDesign !== 'string' || rawDesign.length > 8192)
    throw new HttpError(400, 'Invalid frame design.');
  let json: unknown;
  try {
    json = JSON.parse(rawDesign);
  } catch {
    throw new HttpError(400, 'Invalid frame design.');
  }
  const design = frameDesignSchema.parse(json);
  const files = form.getAll('photos');
  if (files.length !== design.crops.length)
    throw new HttpError(400, 'Add one image for each photo space.');
  const images: Buffer[] = [];
  let totalBytes = 0;
  for (const file of files) {
    if (typeof file === 'string' || !file.size || file.size > FRAME_FILE_MAX) {
      throw new HttpError(400, 'Each image must be between 1 byte and 12 MiB.');
    }
    totalBytes += file.size;
    if (totalBytes > FRAME_FILES_MAX)
      throw new HttpError(413, 'The total image size exceeds 32 MiB.');
    images.push(Buffer.from(await file.arrayBuffer()));
  }
  const hashes = images.map((buffer) => createHash('sha256').update(buffer).digest('hex'));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([fields, design, hashes]))
    .digest('hex');
  return { fields, design, images, fingerprint };
}

type Submission = Awaited<ReturnType<typeof parseSubmission>>;
const receiptSelect = {
  id: true,
  reference: true,
  unitPrice: true,
  quantity: true,
  fingerprint: true,
} as const;
type SavedOrder = Prisma.FrameOrderGetPayload<{ select: typeof receiptSelect }>;
function receipt(order: SavedOrder, expectedFingerprint: string) {
  if (order.fingerprint !== expectedFingerprint) {
    throw new HttpError(409, 'This request number was already used for a different frame order.');
  }
  return {
    id: order.id,
    reference: order.reference,
    unitPrice: order.unitPrice,
    quantity: order.quantity,
  };
}

export class FramePriceChanged extends HttpError {
  constructor(public readonly unitPrice: number | null) {
    super(409, 'The frame price has changed. Review the new price and submit again.');
  }
}

// Each insert stays well below MySQL packet limits, including on shared hosting.
async function writeAsset(
  tx: Prisma.TransactionClient,
  orderId: string,
  kind: FrameAssetKind,
  buffer: Buffer,
) {
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    await tx.frameAssetChunk.create({
      data: {
        orderId,
        kind,
        position: offset / chunkSize,
        data: new Uint8Array(buffer.subarray(offset, offset + chunkSize)),
      },
      select: { position: true },
    });
  }
}

async function createOrder(submission: Submission) {
  const { fields, design, images, fingerprint } = submission;
  const unitPrice = frameUnitPrice(await getFramePrices(), design.size, fields.paper);
  if (fields.expectedUnitPrice !== unitPrice) throw new FramePriceChanged(unitPrice);
  let artwork: Awaited<ReturnType<typeof renderFrameArtwork>>;
  try {
    artwork = await renderFrameArtwork(design, images);
  } catch (error) {
    if (error instanceof FrameArtworkError) throw new HttpError(422, error.message);
    throw error;
  }
  if (
    !artwork.pdf.length ||
    artwork.pdf.length > 48 * MiB ||
    !artwork.preview.length ||
    artwork.preview.length > 4 * MiB
  ) {
    throw new HttpError(
      422,
      'The print file exceeds the supported size. Try another source image.',
    );
  }
  try {
    const order = await db.$transaction(
      async (tx) => {
        const row = await tx.frameOrder.create({
          data: {
            idempotencyKey: fields.idempotencyKey,
            fingerprint,
            reference: 'GX-F-' + randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
            name: fields.name,
            email: fields.email,
            phone: fields.phone,
            quantity: fields.quantity,
            notes: fields.notes,
            design,
            paper: fields.paper,
            unitPrice,
            effectivePpi: artwork.effectivePpi,
            pdfBytes: artwork.pdf.length,
            previewBytes: artwork.preview.length,
          },
          select: receiptSelect,
        });
        await writeAsset(tx, row.id, 'PRINT', artwork.pdf);
        await writeAsset(tx, row.id, 'PREVIEW', artwork.preview);
        return row;
      },
      { timeout: 60000 },
    );
    return { result: receipt(order, fingerprint), created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
      throw error;
    const existing = await db.frameOrder.findUnique({
      where: { idempotencyKey: fields.idempotencyKey },
      select: receiptSelect,
    });
    if (!existing) throw error;
    return { result: receipt(existing, fingerprint), created: false };
  }
}

let activeUploads = 0;
let activeRender:
  { key: string; fingerprint: string; promise: ReturnType<typeof createOrder> } | undefined;

export async function submitFrameOrder(request: Request) {
  // Bound memory before buffering multipart files. Rendering can expand one A3+ print to tens of MP.
  if (activeUploads >= 2)
    throw new HttpError(503, 'The print studio is processing other artwork. Please retry shortly.');
  activeUploads++;
  try {
    await rateLimit(request, 'frame-upload', 12, 900);
    const submission = await parseSubmission(request);
    const key = submission.fields.idempotencyKey;
    const existing = await db.frameOrder.findUnique({
      where: { idempotencyKey: key },
      select: receiptSelect,
    });
    if (existing) return { result: receipt(existing, submission.fingerprint), created: false };
    if (activeRender) {
      if (activeRender.key !== key)
        throw new HttpError(
          503,
          'The print studio is processing another frame. Please retry shortly.',
        );
      if (activeRender.fingerprint !== submission.fingerprint)
        throw new HttpError(409, 'A different frame order is using this request number.');
      const { result } = await activeRender.promise;
      return { result, created: false };
    }
    const promise = createOrder(submission);
    activeRender = { key, fingerprint: submission.fingerprint, promise };
    try {
      return await promise;
    } finally {
      activeRender = undefined;
    }
  } finally {
    activeUploads--;
  }
}

export async function frameAssetResponse(id: string, kind: FrameAssetKind) {
  const order = await db.frameOrder.findUnique({
    where: { id },
    select: {
      reference: true,
      pdfBytes: true,
      previewBytes: true,
      chunks: {
        where: { kind },
        orderBy: { position: 'asc' },
        select: { position: true, data: true },
      },
    },
  });
  if (!order) throw new HttpError(404, 'Frame order not found.');
  const expected = kind === 'PRINT' ? order.pdfBytes : order.previewBytes;
  if (
    order.chunks.length !== Math.ceil(expected / chunkSize) ||
    order.chunks.some(
      (part, index) =>
        part.position !== index ||
        part.data.byteLength !== Math.min(chunkSize, expected - index * chunkSize),
    )
  ) {
    throw new HttpError(500, 'The saved artwork is incomplete.');
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of order.chunks) controller.enqueue(part.data);
      controller.close();
    },
  });
  const print = kind === 'PRINT';
  return new Response(stream, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': print ? 'application/pdf' : 'image/jpeg',
      'Content-Length': String(expected),
      'Content-Disposition':
        (print ? 'attachment' : 'inline') +
        '; filename="' +
        order.reference +
        (print ? '-print.pdf"' : '-preview.jpg"'),
    },
  });
}
