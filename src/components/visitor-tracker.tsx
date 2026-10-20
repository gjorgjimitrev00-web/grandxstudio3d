'use client';
import { useEffect, useState } from 'react';

const key = 'gx-analytics-opt-out';
let excludedInMemory = false;
let lastSentDay = '';
function browserPrivacySignal() {
  const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
  return navigator.doNotTrack === '1' || !!browser.globalPrivacyControl;
}
function excluded() {
  if (excludedInMemory || browserPrivacySignal()) return true;
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}
function day() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Skopje',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function VisitorTracker({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let busy = false,
      stopped = false;
    async function record() {
      const today = day();
      if (
        stopped ||
        busy ||
        excluded() ||
        document.visibilityState !== 'visible' ||
        lastSentDay === today
      )
        return;
      busy = true;
      try {
        const response = await fetch('/api/visits', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (response.ok) lastSentDay = today;
      } catch {
        /* Analytics stays optional when offline or blocked. */
      } finally {
        busy = false;
      }
    }
    // Deferring one tick also avoids duplicate effects during development.
    const initial = setTimeout(record, 0);
    const rollover = setInterval(record, 60000);
    document.addEventListener('visibilitychange', record);
    window.addEventListener('gx-analytics-preference', record);
    return () => {
      stopped = true;
      clearTimeout(initial);
      clearInterval(rollover);
      document.removeEventListener('visibilitychange', record);
      window.removeEventListener('gx-analytics-preference', record);
    };
  }, [enabled]);
  return null;
}

export function AnalyticsPrivacy({ locale, enabled }: { locale: string; enabled: boolean }) {
  const en = locale === 'en';
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [browserExcluded, setBrowserExcluded] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setOptedOut(excluded());
    setBrowserExcluded(browserPrivacySignal());
  }, []);
  return (
    <section className="analytics-privacy" id="visitor-statistics">
      <h2>{en ? 'Visitor statistics' : 'Статистика за посетите'}</h2>
      <p>
        {en
          ? 'We count approximate daily visitors and cities in North Macedonia to understand how the shop is used. No analytics cookies or advertising trackers are used. A protected identifier derived from the network address and browser changes each day. The analytics database stores this identifier, the day, approximate city and first/last visit times for a 35-day reporting window. Older records are removed during subsequent site activity or scheduled maintenance. It does not store your raw IP address, browsing history, precise location or contact details, and it is not linked to orders or accounts.'
          : 'Броиме приближни дневни посетители и градови во Северна Македонија за да разбереме како се користи продавницата. Не користиме аналитички колачиња или рекламно следење. Заштитен идентификатор, изведен од мрежната адреса и прелистувачот, се менува секој ден. Во аналитичката база се чуваат овој идентификатор, денот, приближниот град и времето на првата и последната посета за извештаи од последните 35 дена. Постарите записи се бришат при следна активност на страницата или редовно одржување. Не се чуваат вашата целосна IP-адреса, историја на прелистување, прецизна локација или контактни податоци и нема поврзување со нарачки или профили.'}
      </p>
      <p>
        {en
          ? 'City lookup happens on our server using a local database. Your IP is not sent to a geolocation service. Cities may be inaccurate, especially on mobile networks or VPNs. Do Not Track and Global Privacy Control signals are respected. You can also exclude this browser from future measurement below; only this preference is saved locally.'
          : 'Градот се проценува на нашиот сервер со локална база. Вашата IP-адреса не се испраќа до услуга за геолокација. Проценката може да биде неточна, особено преку мобилна мрежа или VPN. Ги почитуваме сигналите Do Not Track и Global Privacy Control. Подолу може да го исклучите овој прелистувач од идно мерење; локално се зачувува само овој избор.'}
      </p>
      <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">
        IP Geolocation by DB-IP
      </a>
      {!enabled && (
        <p>
          {en
            ? 'Visitor measurement is currently paused.'
            : 'Мерењето на посети моментално е паузирано.'}
        </p>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={optedOut ?? false}
          disabled={optedOut === null || browserExcluded}
          onChange={(event) => {
            const value = event.target.checked;
            excludedInMemory = value;
            setOptedOut(value);
            try {
              localStorage.setItem(key, String(value));
              setMessage(en ? 'Preference saved.' : 'Изборот е зачуван.');
            } catch {
              setMessage(
                en
                  ? 'This browser blocks storage. The choice applies to this open tab.'
                  : 'Прелистувачот блокира зачувување. Изборот важи во овој отворен таб.',
              );
            }
            window.dispatchEvent(new Event('gx-analytics-preference'));
          }}
        />
        {en
          ? 'Exclude this browser from visitor statistics'
          : 'Исклучи го овој прелистувач од статистиката'}
      </label>
      {browserExcluded && (
        <p>
          {en
            ? 'Your browser’s privacy signal excludes you automatically. Change it in your browser settings to allow measurement.'
            : 'Сигналот за приватност од вашиот прелистувач автоматски ве исклучува од мерењето. Овој избор се менува во поставките на прелистувачот.'}
        </p>
      )}
      <p className="form-note" role="status">
        {message}
      </p>
    </section>
  );
}
