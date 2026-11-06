'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Expand,
  FileImage,
  Images,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FRAME_PHOTO_COUNTS,
  FRAME_SIZES,
  FRAME_FILE_MAX,
  FRAME_FILES_MAX,
  FRAME_MIN_PPI,
  FRAME_TARGET_PPI,
  effectiveFramePpi,
  frameDesignSchema,
  framePaperDimensions,
  renderFrameSvg,
  type FrameDesign,
  type FramePhoto,
} from '@/lib/frame-artwork';
import { frameUnitPrice, type FramePrices } from '@/lib/frame-price-rules';
import { frameStudioCopy } from '@/lib/frame-studio-copy';
import { money } from '@/lib/utils';

type Photo = FramePhoto & { file: File; token: string };
type Crop = FrameDesign['crops'][number];
type Template = FrameDesign['template'];
const templates: Template[] = ['love', 'story', 'moments', 'custom'];
const center = (): Crop => ({ zoom: 1, panX: 0.5, panY: 0.5 });
const emptyCrops = (template: Template) =>
  Array.from({ length: FRAME_PHOTO_COUNTS[template] }, center);
const sizeLabel = (size: FrameDesign['size']) =>
  (({ '4x6': '4 × 6″', '5x7': '5 × 7″', '8x10': '8 × 10″' }) as Record<string, string>)[size] ||
  size;
const samplePhoto = (template: Template, index: number): FramePhoto => ({
  width: 640,
  height: 427,
  src:
    template === 'story'
      ? '/images/frames/story-sample.webp'
      : '/images/frames/love-sample-' + (index + 1) + '.webp',
});

async function loadPhoto(file: File): Promise<Photo> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > FRAME_FILE_MAX
  )
    throw Error('invalid');
  const src = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 40_000_000) throw Error('invalid');
    return { file, src, width, height, token: crypto.randomUUID() };
  } catch {
    URL.revokeObjectURL(src);
    throw Error('invalid');
  }
}

export function FrameStudio({ locale, prices }: { locale: 'mk' | 'en'; prices: FramePrices }) {
  const t = frameStudioCopy[locale];
  const [template, setTemplate] = useState<Template>('love');
  const [size, setSize] = useState<FrameDesign['size']>('A4');
  const [paper, setPaper] = useState<'matte' | 'glossy'>('matte');
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<(Photo | null)[]>([null, null, null, null, null]);
  const [crops, setCrops] = useState<Record<Template, Crop[]>>(() => ({
    love: emptyCrops('love'),
    story: emptyCrops('story'),
    moments: emptyCrops('moments'),
    custom: emptyCrops('custom'),
  }));
  const [selected, setSelected] = useState(0);
  const [names, setNames] = useState('');
  const [date, setDate] = useState('');
  const [caption, setCaption] = useState('');
  const [details, setDetails] = useState(false);
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    quantity: '1',
  });
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [reference, setReference] = useState('');
  const [priceUpdates, setPriceUpdates] = useState<Record<string, number | null>>({});
  const upload = useRef<HTMLInputElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLElement>(null);
  const urls = useRef(new Set<string>());
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const custom = template === 'custom';
  const count = FRAME_PHOTO_COUNTS[template];
  const currentPhotos = useMemo(
    () => (custom ? photos.slice(4) : photos.slice(0, count)),
    [custom, photos, count],
  );
  const photo = currentPhotos[selected];
  const crop = crops[template][selected];
  const demo = !custom && currentPhotos.every((p) => !p);
  const priceKey = size + ':' + paper;
  const unitPrice = Object.hasOwn(priceUpdates, priceKey)
    ? priceUpdates[priceKey]
    : frameUnitPrice(prices, size, paper);
  function formatPrice(n: number | null) {
    if (n === null) return t.quote;
    return locale === 'mk' ? money(n) : n.toLocaleString('en-GB') + ' MKD';
  }

  const design = useMemo<FrameDesign>(
    () => ({
      template,
      size,
      fit: custom ? fit : 'cover',
      orientation: custom ? orientation : 'portrait',
      crops: crops[template],
      names: custom ? '' : names.trim(),
      date: custom ? '' : date.trim(),
      caption: custom ? '' : caption.trim(),
    }),
    [template, size, custom, fit, orientation, crops, names, date, caption],
  );
  const dimensions = framePaperDimensions(design);
  const artwork = useMemo(() => {
    const shown = demo
      ? {
          ...design,
          names: design.names || t.namesHint,
          date: design.date || t.dateHint,
          caption: design.caption || t.captionHint,
        }
      : design;
    try {
      return {
        svg: renderFrameSvg(
          shown,
          demo ? currentPhotos.map((_, i) => samplePhoto(template, i)) : currentPhotos,
        ),
        ppi: effectiveFramePpi(design, currentPhotos),
        error: frameDesignSchema.safeParse(design).success ? '' : t.textError,
      };
    } catch {
      return { svg: '', ppi: [], error: t.textError };
    }
  }, [design, demo, template, currentPhotos, t]);

  useEffect(() => {
    const allocated = urls.current;
    return () => {
      for (const src of allocated) URL.revokeObjectURL(src);
      allocated.clear();
    };
  }, []);
  useEffect(() => {
    const used = new Set(photos.flatMap((p) => (p ? [p.src] : [])));
    for (const src of urls.current)
      if (!used.has(src)) {
        URL.revokeObjectURL(src);
        urls.current.delete(src);
      }
  }, [photos]);

  function selectTemplate(value: Template) {
    setTemplate(value);
    setSelected(0);
    setError('');
  }
  function changeCrop(patch: Partial<Crop>) {
    setCrops((old) => ({
      ...old,
      [template]: old[template].map((c, i) => (i === selected ? { ...c, ...patch } : c)),
    }));
  }
  async function addPhotos(files: File[]) {
    if (!files.length || reading || sending) return;
    setError('');
    if (files.length > count) {
      setError(t.many);
      return;
    }
    const slots = files.map((_, i) => (selected + i) % count);
    const retained = currentPhotos.reduce(
      (sum, p, i) => sum + (slots.includes(i) ? 0 : p?.file.size || 0),
      0,
    );
    if (retained + files.reduce((sum, f) => sum + f.size, 0) > FRAME_FILES_MAX) {
      setError(t.totalSize);
      return;
    }
    setReading(true);
    const decoded: Photo[] = [];
    try {
      for (const file of files) decoded.push(await loadPhoto(file));
      decoded.forEach((p) => urls.current.add(p.src));
      setPhotos((old) => {
        const next = [...old];
        slots.forEach((slot, i) => {
          next[custom ? 4 : slot] = decoded[i];
        });
        return next;
      });
      setCrops((old) => ({
        ...old,
        [template]: old[template].map((c, i) => (slots.includes(i) ? center() : c)),
      }));
    } catch {
      decoded.forEach((p) => URL.revokeObjectURL(p.src));
      setError(t.invalid);
    } finally {
      setReading(false);
    }
  }
  function continueOrder() {
    const missing = currentPhotos.findIndex((p) => !p);
    const weak = artwork.ppi.findIndex((ppi) => ppi < FRAME_MIN_PPI);
    if (missing !== -1) {
      setSelected(missing);
      setError(custom ? t.missingCustom : t.missing);
      return;
    }
    if (artwork.error) {
      setError(artwork.error);
      return;
    }
    if (weak !== -1) {
      setSelected(weak);
      setError(t.someLow);
      return;
    }
    setError('');
    setApproved(false);
    setDetails(true);
    editor.current?.scrollIntoView({ block: 'start' });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !details || !approved) return;
    setSending(true);
    setError('');
    const body = new FormData(event.currentTarget);
    body.set('design', JSON.stringify(design));
    body.set('paper', paper);
    body.set('expectedUnitPrice', unitPrice === null ? '' : String(unitPrice));
    body.set('consent', 'true');
    for (const p of currentPhotos) if (p) body.append('photos', p.file, p.file.name);
    const fingerprint = JSON.stringify([
      design,
      paper,
      unitPrice,
      customer,
      currentPhotos.map((p) => p?.token),
    ]);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    body.set('idempotencyKey', retry.current.key);
    try {
      const response = await fetch('/api/frame-orders', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && result.code === 'FRAME_PRICE_CHANGED') {
          setPriceUpdates((old) => ({ ...old, [priceKey]: result.unitPrice }));
          setApproved(false);
          setError(t.changed);
          return;
        }
        throw Error(result.error || t.failed);
      }
      if (typeof result.reference !== 'string' || !result.reference) throw Error(t.failed);
      setReference(result.reference);
      setPhotos([null, null, null, null, null]);
    } catch (e) {
      setError(
        e instanceof Error && !(e instanceof TypeError || e instanceof SyntaxError)
          ? e.message
          : t.failed,
      );
    } finally {
      setSending(false);
    }
  }

  const printTitle = custom ? t.templates[3] : t.templates[templates.indexOf(template)];
  const orderError = error ? (
    <p className="frame-error" role="alert">
      {error}
    </p>
  ) : null;
  const showPreview = () => {
    setExpanded(true);
    previewDialog.current?.showModal();
  };
  const sheet = (large = false) => (
    <div
      className={
        'frame-mount' +
        (large ? ' large' : '') +
        (dimensions.widthMm > dimensions.heightMm ? ' landscape' : '')
      }
      style={{ aspectRatio: dimensions.widthMm + '/' + dimensions.heightMm }}
    >
      {expanded !== large ? null : custom && !photo ? (
        <div className="frame-placeholder">
          <FileImage aria-hidden="true" />
          <span>{t.empty}</span>
        </div>
      ) : artwork.error ? (
        <p className="frame-placeholder">{artwork.error}</p>
      ) : (
        <div
          className="frame-artwork"
          role="img"
          aria-label={printTitle}
          dangerouslySetInnerHTML={{ __html: artwork.svg }}
        />
      )}
    </div>
  );

  if (reference)
    return (
      <section className="frame-receipt" role="status">
        <CheckCircle2 aria-hidden="true" size={36} />
        <h2>{t.sent}</h2>
        <p>
          {t.ref} <strong>{reference}</strong>
        </p>
        <p>{t.next}</p>
        <Link className="button" href="/shop">
          {t.shop}
          <ArrowRight size={17} />
        </Link>
      </section>
    );

  return (
    <div className="frame-workspace">
      <aside className="frame-preview" id="frame-preview" aria-label={t.preview}>
        <div className="frame-scene">
          <div className="frame-scene-rail">
            <span>{t.preview}</span>
            <button type="button" title={t.view} aria-label={t.view} onClick={showPreview}>
              <Expand size={18} />
            </button>
          </div>
          {sheet()}
          <div className="frame-scene-foot">
            <span>{demo ? t.sample : t.yours}</span>
            <span>{sizeLabel(size)}</span>
          </div>
        </div>
        <p className="frame-proof-note">
          {dimensions.widthMm} × {dimensions.heightMm} mm · {t[paper]}. {t.frameHint}
        </p>
      </aside>
      <dialog
        ref={previewDialog}
        className="frame-dialog"
        aria-label={t.preview}
        onClose={() => setExpanded(false)}
      >
        <div className="frame-dialog-head">
          <strong>
            {t.preview} · {sizeLabel(size)}
          </strong>
          <button
            type="button"
            autoFocus
            aria-label={t.edit}
            onClick={() => previewDialog.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        {sheet(true)}
      </dialog>
      <section className="frame-editor" ref={editor}>
        {!details ? (
          <fieldset className="frame-edit-controls" disabled={reading}>
            <div className="frame-section first">
              <h2>{t.template}</h2>
              <div className="frame-templates">
                {templates.map((id, i) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={template === id}
                    className="frame-template"
                    onClick={() => selectTemplate(id)}
                  >
                    <span className={'frame-mini ' + id} aria-hidden="true">
                      {id === 'custom' ? (
                        <FileImage size={18} />
                      ) : (
                        Array.from({ length: FRAME_PHOTO_COUNTS[id] }, (_, j) => <i key={j} />)
                      )}
                    </span>
                    <span>
                      <strong>{t.templates[i]}</strong>
                      <small>{t.counts[i]}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="frame-section">
              <h2>{custom ? t.artwork : t.photos}</h2>
              {count > 1 && (
                <div className="frame-slots">
                  {currentPhotos.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={t.photo + ' ' + (i + 1)}
                      aria-pressed={selected === i}
                      className={'frame-slot' + (p && artwork.ppi[i] < FRAME_MIN_PPI ? ' low' : '')}
                      onClick={() => {
                        setSelected(i);
                        setError('');
                      }}
                    >
                      {p ? <img src={p.src} alt="" /> : <Plus size={18} />}
                      <span>{i + 1}</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                ref={upload}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={t.chooseFile}
                hidden
                multiple={count > 1}
                onChange={(e) => {
                  const files = Array.from(e.currentTarget.files || []);
                  e.currentTarget.value = '';
                  void addPhotos(files);
                }}
              />
              <button
                type="button"
                className="frame-upload"
                onClick={() => upload.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void addPhotos(Array.from(e.dataTransfer.files));
                }}
              >
                <Upload size={21} />
                <span>
                  {reading
                    ? t.uploadWait
                    : custom
                      ? photo
                        ? t.replaceDesign
                        : t.addDesign
                      : photo
                        ? t.replace
                        : t.add}
                </span>
              </button>
              <p className="frame-hint">{t.uploadInfo}</p>
              {photo && (
                <>
                  <div className="frame-file">
                    <span>{photo.file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotos((old) =>
                          old.map((p, i) => (i === (custom ? 4 : selected) ? null : p)),
                        );
                        setError('');
                      }}
                    >
                      {t.remove}
                    </button>
                  </div>
                  {custom && (
                    <div className="frame-fit">
                      <span>{t.fit}</span>
                      {(['contain', 'cover'] as const).map((f) => (
                        <button
                          type="button"
                          key={f}
                          aria-pressed={fit === f}
                          onClick={() => {
                            setFit(f);
                            changeCrop(center());
                          }}
                        >
                          {t[f]}
                        </button>
                      ))}
                    </div>
                  )}
                  {(!custom || fit === 'cover') && (
                    <div className="frame-crop">
                      <div>
                        <strong>{t.placement}</strong>
                        <button type="button" onClick={() => changeCrop(center())}>
                          {t.reset}
                        </button>
                      </div>
                      {(['zoom', 'panX', 'panY'] as const).map((axis, i) => (
                        <label key={axis}>
                          <span>{[t.zoom, t.horizontal, t.vertical][i]}</span>
                          <input
                            type="range"
                            min={axis === 'zoom' ? 1 : 0}
                            max={axis === 'zoom' ? 3 : 1}
                            step="0.01"
                            value={crop[axis]}
                            onChange={(e) => changeCrop({ [axis]: Number(e.target.value) })}
                          />
                          <small>
                            {axis === 'zoom'
                              ? crop.zoom.toFixed(2) + '×'
                              : Math.round(crop[axis] * 100) + '%'}
                          </small>
                        </label>
                      ))}
                    </div>
                  )}
                  <p
                    className={
                      'frame-quality' + (artwork.ppi[selected] < FRAME_MIN_PPI ? ' low' : '')
                    }
                  >
                    {t.ppi} · {Math.floor(artwork.ppi[selected] || 0)} PPI
                    {artwork.ppi[selected] < FRAME_TARGET_PPI && (
                      <span>{artwork.ppi[selected] < FRAME_MIN_PPI ? t.low : t.moderate}</span>
                    )}
                  </p>
                </>
              )}
            </div>
            {!custom && (
              <div className="frame-section">
                <h2>{t.customize}</h2>
                <div className="frame-fields">
                  <label>
                    {t.names}
                    <input
                      value={names}
                      onChange={(e) => setNames(e.target.value)}
                      maxLength={60}
                      placeholder={t.namesHint}
                    />
                  </label>
                  <label>
                    {t.date}
                    <input
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      maxLength={32}
                      placeholder={t.dateHint}
                    />
                  </label>
                  <label className="full">
                    {t.caption}
                    <input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      maxLength={100}
                      placeholder={t.captionHint}
                    />
                  </label>
                </div>
              </div>
            )}
            <div className="frame-section">
              <h2>{t.formats}</h2>
              <div className="frame-fields">
                <label>
                  {t.size}
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value as FrameDesign['size'])}
                  >
                    {(Object.keys(FRAME_SIZES) as FrameDesign['size'][]).map((s) => (
                      <option value={s} key={s}>
                        {sizeLabel(s)} · {FRAME_SIZES[s].widthMm} × {FRAME_SIZES[s].heightMm} mm
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.paper}
                  <select
                    value={paper}
                    onChange={(e) => setPaper(e.target.value as 'matte' | 'glossy')}
                  >
                    <option value="matte">{t.matte}</option>
                    <option value="glossy">{t.glossy}</option>
                  </select>
                </label>
                {custom && (
                  <label>
                    {locale === 'mk' ? 'Ориентација' : 'Orientation'}
                    <select
                      value={orientation}
                      onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                    >
                      <option value="portrait">
                        {locale === 'mk' ? 'Вертикално' : 'Portrait'}
                      </option>
                      <option value="landscape">
                        {locale === 'mk' ? 'Хоризонтално' : 'Landscape'}
                      </option>
                    </select>
                  </label>
                )}
              </div>
              <div className="frame-price">
                <span>{t.unit}</span>
                <strong>{formatPrice(unitPrice)}</strong>
              </div>
              {orderError}
              <div className="frame-actions">
                <button className="button" type="button" onClick={continueOrder}>
                  {t.continue}
                  <ArrowRight size={17} />
                </button>
                <button type="button" className="frame-view" onClick={showPreview}>
                  <Images size={17} />
                  {t.view}
                </button>
              </div>
            </div>
          </fieldset>
        ) : (
          <form className="frame-order" onSubmit={submit}>
            <fieldset disabled={sending} className="frame-edit-controls">
              <button
                type="button"
                className="frame-back"
                onClick={() => {
                  setDetails(false);
                  setError('');
                  setApproved(false);
                }}
              >
                <ArrowLeft size={16} />
                {t.back}
              </button>
              <h2>{t.orderTitle}</h2>
              <p className="frame-order-format">
                {printTitle} · {sizeLabel(size)} · {t[paper]}
              </p>
              <div className="frame-fields">
                {(['name', 'phone', 'email', 'quantity'] as const).map((key) => (
                  <label key={key} className={key === 'email' ? 'full' : ''}>
                    {key === 'quantity' ? t.qty : t[key]}
                    <input
                      name={key}
                      type={
                        key === 'quantity'
                          ? 'number'
                          : key === 'phone'
                            ? 'tel'
                            : key === 'email'
                              ? 'email'
                              : 'text'
                      }
                      autoComplete={key === 'phone' ? 'tel' : key === 'quantity' ? 'off' : key}
                      maxLength={key === 'phone' ? 25 : key === 'email' ? 191 : 120}
                      min={key === 'quantity' ? 1 : undefined}
                      max={key === 'quantity' ? 20 : undefined}
                      step={key === 'quantity' ? 1 : undefined}
                      required
                      value={customer[key]}
                      onChange={(e) => setCustomer((c) => ({ ...c, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <label className="full">
                  {t.notes}
                  <textarea
                    name="notes"
                    value={customer.notes}
                    maxLength={1000}
                    placeholder={t.notesHint}
                    onChange={(e) => setCustomer((c) => ({ ...c, notes: e.target.value }))}
                  />
                </label>
              </div>
              <input
                className="honeypot"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              <div className="frame-price">
                <span>{t.total}</span>
                <strong>
                  {unitPrice === null
                    ? t.quote
                    : formatPrice(unitPrice * (Number(customer.quantity) || 0))}
                </strong>
              </div>
              <p className="frame-hint">{unitPrice === null ? t.quoteNote : t.priceNote}</p>
              <label className="frame-consent">
                <input
                  type="checkbox"
                  checked={approved}
                  required
                  onChange={(e) => setApproved(e.target.checked)}
                />
                <span>
                  {t.consent}{' '}
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                    {t.privacy}
                  </Link>
                </span>
              </label>
              {orderError}
              <div className="frame-actions">
                <button type="submit" className="button">
                  {sending ? t.sending : t.submit}
                  <Check size={17} />
                </button>
                <button type="button" className="frame-view" onClick={showPreview}>
                  <Images size={17} />
                  {t.view}
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
    </div>
  );
}
