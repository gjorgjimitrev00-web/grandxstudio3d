'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Recheck schedules while a storefront page is open. Checkout also re-quotes on the server.
export function CampaignRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);
  return null;
}
