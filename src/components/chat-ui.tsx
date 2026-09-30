'use client';
import { useEffect, useRef } from 'react';
import type { ChatMessageView } from '@/lib/chat-contract';

export async function chatRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Chat request failed.');
  return body;
}
export function mergeMessages(current: ChatMessageView[], incoming: ChatMessageView[]) {
  return [
    ...new Map([...current, ...incoming].map((message) => [message.id, message])).values(),
  ].sort((a, b) => a.id - b.id);
}
export function useChatPoll(
  task: (signal: AbortSignal) => Promise<void>,
  interval: number,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const run = async () => {
      if (stopped || document.hidden) return;
      const runId = ++generation;
      const activeController = new AbortController();
      controller = activeController;
      const timeout = setTimeout(() => activeController.abort(), 15000);
      try {
        await task(activeController.signal);
      } catch {
        /* Callers show connection state and preserve drafts. */
      } finally {
        clearTimeout(timeout);
        if (!stopped && !document.hidden && runId === generation) timer = setTimeout(run, interval);
      }
    };
    const visibility = () => {
      generation++;
      clearTimeout(timer);
      controller?.abort();
      if (!document.hidden) void run();
    };
    void run();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [task, interval, enabled]);
}
export function ChatMessages({
  messages,
  ownSender,
  you,
  other,
  locale,
  earlier,
  hasOlder,
  loadingOlder,
  onOlder,
}: {
  messages: ChatMessageView[];
  ownSender: 'VISITOR' | 'ADMIN';
  you: string;
  other: string;
  locale: string;
  earlier: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  onOlder: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = messages.at(-1)?.id;
  useEffect(() => {
    if (stick.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [last]);
  return (
    <div
      className="chat-messages"
      ref={scroller}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Conversation"
      onScroll={() => {
        const el = scroller.current!;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {hasOlder && (
        <button
          type="button"
          className="text-link chat-earlier"
          disabled={loadingOlder}
          onClick={onOlder}
        >
          {loadingOlder ? '…' : earlier}
        </button>
      )}
      {messages.map((message) => (
        <article
          className={`chat-message ${message.sender === ownSender ? 'chat-message-own' : ''}`}
          key={message.id}
        >
          <span className="chat-message-author">{message.sender === ownSender ? you : other}</span>
          <p>{message.text}</p>
          <time
            dateTime={message.createdAt}
            title={new Date(message.createdAt).toLocaleString(locale)}
          >
            {new Date(message.createdAt).toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </article>
      ))}
    </div>
  );
}
