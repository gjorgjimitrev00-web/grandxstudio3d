'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, ArrowUpRight } from 'lucide-react';
import { chatCopy } from '@/lib/chat-copy';
import type { ChatConversationView, ChatMessageView, ChatSnapshot } from '@/lib/chat-contract';
import { ChatMessages, chatRequest, mergeMessages, useChatPoll } from './chat-ui';

export function LiveChat({ locale }: { locale: 'mk' | 'en' }) {
  const copy = chatCopy[locale];
  const [open, setOpen] = useState(false);
  const [resume, setResume] = useState(false);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversation, setConversation] = useState<ChatConversationView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [online, setOnline] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [retry, setRetry] = useState(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const thread = useRef<string | null>(null);
  const latest = useRef(0);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const active = open || resume;
  useEffect(() => {
    try {
      setResume(sessionStorage.getItem('gx-chat-started') === '1');
    } catch {
      /* Chat also works when browser storage is blocked. */
    }
  }, []);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setReady(false);
    void chatRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ action: 'initialize' }),
      signal: controller.signal,
    })
      .then(() => {
        if (!controller.signal.aborted) {
          setReady(true);
          setConnectionError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnectionError(true);
      });
    return () => controller.abort();
  }, [active, retry]);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const snapshot = await chatRequest<ChatSnapshot>(
          `/api/chat${latest.current ? `?after=${latest.current}` : ''}`,
          { signal },
        );
        if (signal?.aborted) return;
        if (thread.current !== snapshot.conversation?.id) {
          thread.current = snapshot.conversation?.id || null;
          latest.current = 0;
          setMessages(snapshot.messages);
        } else setMessages((old) => mergeMessages(old, snapshot.messages));
        if (!latest.current) setHasOlder(snapshot.hasMore);
        latest.current = Math.max(latest.current, ...snapshot.messages.map((m) => m.id));
        setConversation(snapshot.conversation);
        setOnline(!!snapshot.online);
        setEnabled(snapshot.enabled !== false);
        setLoaded(true);
        setConnectionError(false);
        if (
          snapshot.conversation &&
          open &&
          !document.hidden &&
          snapshot.conversation.lastAdminMessageId > snapshot.conversation.visitorReadThrough
        ) {
          await chatRequest('/api/chat', {
            method: 'PATCH',
            body: JSON.stringify({ through: latest.current }),
            signal,
          });
        }
      } catch (error) {
        if (!signal?.aborted) setConnectionError(true);
        throw error;
      }
    },
    [open],
  );
  useChatPoll(refresh, open ? 4000 : 30000, active && ready);
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  const unread =
    !!conversation && conversation.lastAdminMessageId > conversation.visitorReadThrough;
  return (
    <div className="live-chat">
      {open && (
        <section
          ref={panel}
          className="chat-window"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header className="chat-header">
            <span className="chat-studio-mark">
              <MessageCircle size={22} />
            </span>
            <div>
              <h2 id="chat-title">{copy.title}</h2>
              <p>
                <span
                  className={`chat-presence ${online && !connectionError ? 'is-online' : ''}`}
                />
                {online && !connectionError ? copy.online : copy.offline}
              </p>
            </div>
            <button
              type="button"
              className="chat-icon-button"
              aria-label={copy.close}
              onClick={close}
            >
              <X size={21} />
            </button>
          </header>
          {!ready || !loaded ? (
            <div className="chat-welcome">
              <p role="status">{connectionError ? copy.connection : copy.loading}</p>
              {connectionError && (
                <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
                  {copy.retry}
                </button>
              )}
            </div>
          ) : (
            <>
              {conversation ? (
                <>
                  <ChatMessages
                    messages={messages}
                    ownSender="VISITOR"
                    you={copy.you}
                    other={copy.studio}
                    locale={locale}
                    earlier={copy.earlier}
                    hasOlder={hasOlder}
                    loadingOlder={loadingOlder}
                    onOlder={async () => {
                      setLoadingOlder(true);
                      try {
                        const data = await chatRequest<ChatSnapshot>(
                          `/api/chat?before=${messages[0].id}`,
                        );
                        setMessages((old) => mergeMessages(old, data.messages));
                        setHasOlder(data.hasMore);
                      } catch {
                        setError(copy.error);
                      } finally {
                        setLoadingOlder(false);
                      }
                    }}
                  />
                  {conversation.status === 'CLOSED' && (
                    <p className="chat-notice">{copy.resolved}</p>
                  )}
                </>
              ) : (
                <div className="chat-welcome">
                  <span className="eyebrow orange">GRANDXSTUDIO</span>
                  <h3>{copy.welcome}</h3>
                  <p>{online ? copy.intro : copy.away}</p>
                </div>
              )}
              {!online && conversation && <p className="chat-notice">{copy.away}</p>}
              {connectionError && (
                <p className="chat-notice" role="status">
                  {copy.connection}
                </p>
              )}
              {enabled ? (
                <form
                  className="chat-compose"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    const form = new FormData(event.currentTarget);
                    const input = {
                      text,
                      ...(!conversation
                        ? {
                            name: form.get('name'),
                            email: form.get('email'),
                            consent: form.get('consent') === 'on',
                            website: form.get('website'),
                          }
                        : {}),
                    };
                    const body = JSON.stringify(input);
                    if (pending.current?.body !== body)
                      pending.current = { body, id: crypto.randomUUID() };
                    try {
                      const result = await chatRequest<{ message: ChatMessageView }>('/api/chat', {
                        method: 'POST',
                        body: JSON.stringify({ ...input, clientId: pending.current.id }),
                      });
                      setMessages((old) => mergeMessages(old, [result.message]));
                      setText('');
                      pending.current = null;
                      setResume(true);
                      try {
                        sessionStorage.setItem('gx-chat-started', '1');
                      } catch {
                        /* The private cookie is sufficient to reopen chat. */
                      }
                      await refresh().catch(() => {});
                    } catch (e) {
                      setError(e instanceof Error ? e.message : copy.error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {!conversation && (
                    <>
                      <div className="chat-identity">
                        <label>
                          {copy.name}
                          <input name="name" required maxLength={100} autoComplete="name" />
                        </label>
                        <label>
                          {copy.email}
                          <input
                            name="email"
                            type="email"
                            required
                            maxLength={191}
                            autoComplete="email"
                          />
                        </label>
                      </div>
                      <label className="chat-honeypot" aria-hidden="true">
                        Website
                        <input name="website" tabIndex={-1} autoComplete="off" />
                      </label>
                    </>
                  )}
                  <label className="chat-message-label">
                    {copy.message}
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      required
                      maxLength={2000}
                      rows={3}
                      placeholder={copy.placeholder}
                    />
                  </label>
                  {!conversation && (
                    <label className="chat-consent">
                      <input name="consent" type="checkbox" required />
                      <span>
                        {copy.privacy}{' '}
                        <Link href="/privacy" target="_blank">
                          {copy.privacyLink}
                        </Link>
                      </span>
                    </label>
                  )}
                  {error && (
                    <p className="error-text" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="button orange-bg chat-send" disabled={busy || !text.trim()}>
                    {busy ? copy.sending : copy.send}
                    <Send size={16} />
                  </button>
                  <p className="chat-footnote">{copy.returnNotice}</p>
                </form>
              ) : (
                <div className="chat-welcome">
                  <p>{copy.unavailable}</p>
                  <Link className="text-link" href="/contact">
                    {copy.contact}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="chat-launcher"
        aria-expanded={open}
        aria-label={copy.launcher}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        <span>{copy.launcher}</span>
        {!open && unread && <span className="chat-unread-dot" aria-label={copy.newReply} />}
      </button>
    </div>
  );
}
