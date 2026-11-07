'use client';

import { Bookmark, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  deleteFrameDraft,
  FrameDraftConflictError,
  loadFrameDraft,
  readFrameDraftInfo,
  saveFrameDraft,
  type FrameDraftInfo,
  type FrameDraftState,
} from '@/lib/frame-draft';

const copy = {
  mk: {
    title: 'Продолжи подоцна',
    stored: 'Зачуван нацрт',
    save: 'Зачувај за подоцна',
    resume: 'Продолжи со нацртот',
    discard: 'Избриши',
    cancel: 'Откажи',
    note: 'Нацртот и фотографиите се чуваат само во овој прелистувач на овој уред. Ако ги избришеш податоците од прелистувачот, ќе се избрише и нацртот.',
    replace: 'Замени го нацртот',
    replaceAsk: 'Да ја зачуваш оваа рамка на местото на претходниот нацрт?',
    resumeAsk: 'Да го отвориш зачуваниот нацрт? Со тоа ќе ги замениш тековните измени во едиторот.',
    deleteAsk: 'Да го избришеш зачуваниот нацрт и неговите фотографии од овој прелистувач?',
    saved: 'Нацртот е зачуван. Можеш да ја затвориш страницата.',
    changed: 'Има нови измени. Зачувај ги пред да ја затвориш страницата.',
    resumed: 'Нацртот е отворен.',
    removed: 'Зачуваниот нацрт е избришан.',
    conflict: 'Нацртот е променет во друга картичка. Провери ја зачуваната верзија.',
    readError:
      'Нацртот не можеше да се отвори. Провери дали прелистувачот дозволува локално складирање.',
    saveError:
      'Нацртот не се зачува. Провери дали има слободен простор и дали е дозволено локално складирање.',
    deleteError: 'Нацртот не се избриша. Обиди се повторно.',
  },
  en: {
    title: 'Finish later',
    stored: 'Saved draft',
    save: 'Save for later',
    resume: 'Resume draft',
    discard: 'Delete',
    cancel: 'Cancel',
    note: 'The draft and its photos stay in this browser on this device. Clearing browser data also clears your draft.',
    replace: 'Replace draft',
    replaceAsk: 'Save this frame in place of your previous draft?',
    resumeAsk: 'Open the saved draft? This replaces your current edits in the editor.',
    deleteAsk: 'Delete the saved draft and its photos from this browser?',
    saved: 'Draft saved. You can close this page.',
    changed: 'You have changes to save before closing this page.',
    resumed: 'Your draft is open.',
    removed: 'Saved draft deleted.',
    conflict: 'The draft changed in another tab. Check the saved version.',
    readError: 'The draft could not be opened. Check that this browser allows local storage.',
    saveError: 'The draft could not be saved. Check free space and browser storage permissions.',
    deleteError: 'The draft could not be deleted. Try again.',
  },
};

type Action = 'save' | 'resume' | 'delete';

export function FrameDraftPanel({
  locale,
  state,
  hasEdits,
  disabled,
  onBusyChange,
  onRestore,
}: {
  locale: 'mk' | 'en';
  state: FrameDraftState;
  hasEdits: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onRestore: (draft: FrameDraftState) => Promise<void>;
}) {
  const t = copy[locale];
  const [info, setInfo] = useState<FrameDraftInfo | null>(null);
  const [attached, setAttached] = useState<{
    revision: string;
    template: FrameDraftState['template'];
  } | null>(null);
  const savedState = useRef<FrameDraftState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Action | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);

  useEffect(() => {
    let mounted = true;
    readFrameDraftInfo()
      .then(
        (saved) => {
          if (mounted) setInfo(saved);
        },
        () => {
          if (mounted) setError(t.readError);
        },
      )
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    if (confirm) dialog.current?.showModal();
  }, [confirm]);

  async function run(action: Action) {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    onBusyChange(true);
    setNotice('');
    setError('');
    try {
      if (action === 'save') {
        const saved = await saveFrameDraft(state, info?.revision ?? null);
        setInfo(saved);
        setAttached({ revision: saved.revision, template: state.template });
        savedState.current = state;
        setNotice(t.saved);
      } else if (action === 'resume') {
        const draft = await loadFrameDraft();
        if (!draft || draft.revision !== info?.revision) throw new FrameDraftConflictError();
        await onRestore(draft.state);
        setAttached({ revision: draft.revision, template: draft.state.template });
        setNotice(t.resumed);
      } else if (info) {
        await deleteFrameDraft(info.revision);
        setInfo(null);
        setAttached(null);
        savedState.current = null;
        setNotice(t.removed);
      }
    } catch (cause) {
      if (cause instanceof FrameDraftConflictError) {
        setAttached(null);
        try {
          setInfo(await readFrameDraftInfo());
          setError(t.conflict);
        } catch {
          setError(t.readError);
        }
      } else {
        setError(
          action === 'save' ? t.saveError : action === 'delete' ? t.deleteError : t.readError,
        );
      }
    } finally {
      locked.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  function start(action: Action) {
    if (disabled || !ready || busy) return;
    if (
      action === 'delete' ||
      (action === 'save' &&
        info &&
        (attached?.revision !== info.revision || attached.template !== state.template)) ||
      (action === 'resume' && hasEdits)
    ) {
      setConfirm(action);
    } else {
      void run(action);
    }
  }

  const blocked = disabled || busy || !ready;
  return (
    <section className="frame-draft" aria-label={t.title}>
      <div>
        <strong>{info ? t.stored : t.title}</strong>
        {info && (
          <time dateTime={new Date(info.savedAt).toISOString()}>
            {' '}
            ·{' '}
            {new Date(info.savedAt).toLocaleString(locale === 'mk' ? 'mk-MK' : 'en-GB', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </time>
        )}
        <p>{t.note}</p>
      </div>
      <form
        className="frame-draft-actions"
        id="frame-draft-save"
        onSubmit={(event) => {
          event.preventDefault();
          const source = (event.nativeEvent as SubmitEvent).submitter;
          if (source && !event.currentTarget.contains(source))
            event.currentTarget.closest('section')?.scrollIntoView({ block: 'center' });
          start('save');
        }}
      >
        {info && (
          <button type="button" disabled={blocked} onClick={() => start('resume')}>
            {t.resume}
          </button>
        )}
        <button type="submit" disabled={blocked}>
          <Bookmark size={16} aria-hidden="true" />
          {t.save}
        </button>
        {info && (
          <button
            type="button"
            className="draft-delete"
            disabled={blocked}
            onClick={() => start('delete')}
            aria-label={t.discard}
            title={t.discard}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        )}
      </form>
      {notice && (
        <p className="draft-feedback" role="status">
          {notice === t.saved && state !== savedState.current ? t.changed : notice}
        </p>
      )}
      {error && (
        <p className="draft-feedback frame-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        className="draft-confirm"
        ref={dialog}
        aria-labelledby="frame-draft-question"
        onClose={() => setConfirm(null)}
      >
        <p id="frame-draft-question">
          {confirm === 'save' ? t.replaceAsk : confirm === 'delete' ? t.deleteAsk : t.resumeAsk}
        </p>
        <div className="frame-draft-actions">
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => {
              dialog.current?.close();
              if (confirm) void run(confirm);
            }}
          >
            {confirm === 'save' ? t.replace : confirm === 'delete' ? t.discard : t.resume}
          </button>
        </div>
      </dialog>
    </section>
  );
}
