'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, MessageCircle, Send } from 'lucide-react';
import type { ChatConversationView, ChatMessageView, ChatSnapshot } from '@/lib/chat-contract';
import { ChatMessages, chatRequest, mergeMessages, useChatPoll } from './chat-ui';

function Conversation({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [conversation, setConversation] = useState<ChatConversationView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const latest = useRef(0);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const endpoint = `/api/admin/chat/${id}`;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await chatRequest<ChatSnapshot>(
          `${endpoint}${latest.current ? `?after=${latest.current}` : ''}`,
          { signal },
        );
        if (signal?.aborted) return;
        if (!latest.current) setHasOlder(result.hasMore);
        latest.current = Math.max(latest.current, ...result.messages.map((m) => m.id));
        setConversation(result.conversation);
        setMessages((old) => mergeMessages(old, result.messages));
        setConnectionError(false);
        if (
          result.conversation &&
          result.conversation.lastVisitorMessageId > result.conversation.adminReadThrough &&
          !document.hidden
        )
          await chatRequest(endpoint, {
            method: 'PATCH',
            body: JSON.stringify({ through: latest.current }),
            signal,
          });
      } catch (e) {
        if (!signal?.aborted) setConnectionError(true);
        throw e;
      }
    },
    [endpoint],
  );
  useChatPoll(refresh, 4000);
  if (!conversation)
    return (
      <div className="chat-inbox-placeholder" role="status">
        {connectionError ? 'Could not load this conversation. Retrying…' : 'Loading conversation…'}
      </div>
    );
  return (
    <section className="chat-admin-thread" aria-label={`Conversation with ${conversation.name}`}>
      <header className="chat-thread-header">
        <div>
          <h2>{conversation.name}</h2>
          <a href={`mailto:${conversation.email}`}>{conversation.email}</a>
        </div>
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await chatRequest(endpoint, {
                method: 'PATCH',
                body: JSON.stringify({
                  status: conversation.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                  expectedLastVisitorMessageId: conversation.lastVisitorMessageId,
                }),
              });
              await refresh().catch(() => {});
              await onChange().catch(() => {});
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not update conversation.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Check size={16} />
          {conversation.status === 'OPEN' ? 'Resolve' : 'Reopen'}
        </button>
      </header>
      <ChatMessages
        messages={messages}
        ownSender="ADMIN"
        you="Studio"
        other={conversation.name}
        locale="en-GB"
        earlier="Load earlier messages"
        hasOlder={hasOlder}
        loadingOlder={loadingOlder}
        onOlder={async () => {
          setLoadingOlder(true);
          try {
            const data = await chatRequest<ChatSnapshot>(`${endpoint}?before=${messages[0].id}`);
            setMessages((old) => mergeMessages(old, data.messages));
            setHasOlder(data.hasMore);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load earlier messages.');
          } finally {
            setLoadingOlder(false);
          }
        }}
      />
      {connectionError && (
        <p className="chat-notice" role="status">
          Connection interrupted. Reconnecting… Your draft is preserved.
        </p>
      )}
      {conversation.status === 'CLOSED' && (
        <p className="chat-notice">Resolved. A new message will reopen this conversation.</p>
      )}
      <form
        className="chat-compose"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          if (pending.current?.text !== text) pending.current = { text, id: crypto.randomUUID() };
          try {
            const result = await chatRequest<{ message: ChatMessageView }>(endpoint, {
              method: 'POST',
              body: JSON.stringify({ text, clientId: pending.current.id }),
            });
            setMessages((old) => mergeMessages(old, [result.message]));
            setText('');
            pending.current = null;
            await refresh().catch(() => {});
            await onChange().catch(() => {});
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Message could not be sent.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Reply to customer
          <textarea
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a helpful reply…"
            required
          />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="chat-reply-actions">
          <span className="muted small">Replies appear in the customer’s chat.</span>
          <button className="button" disabled={busy || !text.trim()}>
            <Send size={16} />
            {busy ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ChatInbox() {
  const [conversations, setConversations] = useState<ChatConversationView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [available, setAvailable] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [settingBusy, setSettingBusy] = useState(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await chatRequest<{
          conversations: ChatConversationView[];
          count: number;
          enabled: boolean;
        }>(`/api/admin/chat?page=${page}&status=${status}`, { signal });
        if (signal?.aborted) return;
        setConversations(result.conversations);
        setCount(result.count);
        setEnabled(result.enabled);
        setLoaded(true);
        setError('');
      } catch (e) {
        if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Could not load chats.');
        throw e;
      }
    },
    [page, status],
  );
  useChatPoll(refresh, 5000);
  const heartbeat = useCallback(
    async (signal: AbortSignal) => {
      try {
        await chatRequest('/api/admin/chat', {
          method: 'POST',
          body: JSON.stringify({ available }),
          signal,
        });
        if (!signal.aborted) setOnline(available);
      } catch (e) {
        if (!signal.aborted) setOnline(false);
        throw e;
      }
    },
    [available],
  );
  useChatPoll(heartbeat, 25000);
  useEffect(() => {
    const away = () => {
      setOnline(false);
      void chatRequest('/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({ available: false }),
        keepalive: true,
      }).catch(() => {});
    };
    const visibility = () => {
      if (document.hidden) away();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', away);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', away);
      // Presence expires after navigation; effect cleanup must not race the next heartbeat.
    };
  }, []);
  return (
    <>
      <div className="chat-inbox-controls">
        <label className="chat-switch">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          <span>
            <b>{online && enabled ? 'You’re available' : 'You’re away'}</b>
            <small>Stay on this tab to receive live chats.</small>
          </span>
          <span className={`chat-presence ${online && enabled ? 'is-online' : ''}`} />
        </label>
        <label className="chat-switch">
          <input
            type="checkbox"
            checked={enabled}
            disabled={settingBusy}
            onChange={async (event) => {
              const value = event.target.checked;
              setSettingBusy(true);
              try {
                await chatRequest('/api/admin/chat', {
                  method: 'PATCH',
                  body: JSON.stringify({ enabled: value }),
                });
                setEnabled(value);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not update chat.');
              } finally {
                setSettingBusy(false);
              }
            }}
          />
          <span>Enable storefront chat</span>
        </label>
      </div>
      {error && (
        <p className="error-text chat-inbox-error" role="alert">
          {error}
        </p>
      )}
      <div className="chat-inbox">
        <aside className="chat-conversations" aria-label="Customer conversations">
          <div className="chat-list-heading">
            <h2>
              Conversations <span>{count}</span>
            </h2>
            <label className="sr-only" htmlFor="chat-filter">
              Conversation status
            </label>
            <select
              id="chat-filter"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {['OPEN', 'CLOSED', 'ALL'].map((value) => (
                <option key={value} value={value}>
                  {value === 'OPEN' ? 'Open' : value === 'CLOSED' ? 'Resolved' : 'All chats'}
                </option>
              ))}
            </select>
          </div>
          <div className="chat-conversation-list">
            {conversations.map((conversation) => (
              <button
                type="button"
                className={`chat-conversation ${selected === conversation.id ? 'is-selected' : ''}`}
                key={conversation.id}
                aria-pressed={selected === conversation.id}
                onClick={() => setSelected(conversation.id)}
              >
                <span className="chat-conversation-top">
                  <b>{conversation.name}</b>
                  {conversation.lastVisitorMessageId > conversation.adminReadThrough && (
                    <span className="chat-new">New</span>
                  )}
                </span>
                <p>{conversation.preview}</p>
                <small>
                  {new Date(conversation.lastMessageAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </button>
            ))}
            {!conversations.length && (
              <div className="chat-list-empty">
                <MessageCircle size={28} />
                <p>{loaded ? 'No conversations here yet.' : 'Loading conversations…'}</p>
                <small>Customer messages will appear here automatically.</small>
              </div>
            )}
          </div>
          <div className="chat-pagination">
            <button disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
              Previous
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil(count / 20))}
            </span>
            <button disabled={page * 20 >= count} onClick={() => setPage((n) => n + 1)}>
              Next
            </button>
          </div>
        </aside>
        {selected ? (
          <Conversation key={selected} id={selected} onChange={refresh} />
        ) : (
          <div className="chat-inbox-placeholder">
            <MessageCircle size={38} />
            <h2>A direct line to your customers.</h2>
            <p>Choose a conversation to read and reply.</p>
          </div>
        )}
      </div>
    </>
  );
}
