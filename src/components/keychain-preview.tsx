'use client';
import { useLayoutEffect, useRef } from 'react';
import type { Copy } from '@/lib/i18n';
import { validKeychainName, type KeychainApproval } from '@/lib/keychain-preview';
import styles from './keychain-preview.module.css';

function labelColor(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#171815' : '#FFFFFF';
}

export function KeychainPreview({
  design,
  copy,
  approved,
  onApprove,
}: {
  design: KeychainApproval;
  copy: Copy;
  approved: boolean;
  onApprove: (approve: boolean) => void;
}) {
  const lettering = useRef<SVGTextElement>(null);
  const name = design.name || copy.keychainPlaceholder;
  const base = design.hex || '#B9B8B4';
  const canApprove = validKeychainName(design.name) && Boolean(design.hex);
  useLayoutEffect(() => {
    const text = lettering.current;
    if (!text) return;
    text.setAttribute('font-size', '36');
    const width = text.getComputedTextLength();
    if (width > 210) text.setAttribute('font-size', String((36 * 210) / width));
  }, [name]);

  return (
    <section className={styles.panel} aria-label={copy.keychainTitle}>
      <div className={styles.top}>
        <strong>{copy.keychainTitle}</strong>
        <span>{design.color}</span>
      </div>
      <svg
        className={styles.art}
        viewBox="0 0 360 135"
        role="img"
        aria-label={[copy.keychainTitle, name, design.color].filter(Boolean).join(' · ')}
      >
        <path
          d="M78 36 H294 Q315 36 315 57 V87 Q315 106 293 106 H78 Q55 106 48 87 Q42 72 48 57 Q55 36 78 36 Z"
          fill={base}
          stroke="#36312b"
          strokeWidth="1.4"
        />
        <path
          d="M48 82 Q53 99 78 99 H294 Q310 99 315 84"
          fill="none"
          stroke="#17130d"
          opacity=".28"
          strokeWidth="2"
        />
        <circle cx="67" cy="68" r="6" fill="#f6f1e9" stroke="#36312b" strokeWidth="1.5" />
        <path
          d="M66 68 C43 77 19 60 20 44 C22 28 49 24 64 37 C76 47 75 63 66 68"
          fill="none"
          stroke="#55534f"
          strokeWidth="4"
        />
        <path
          d="M66 68 C43 77 19 60 20 44 C22 28 49 24 64 37 C76 47 75 63 66 68"
          fill="none"
          stroke="#f4f3ef"
          strokeWidth="1.6"
        />
        <text
          ref={lettering}
          xmlSpace="preserve"
          style={{ whiteSpace: 'pre' }}
          x="192"
          y="80"
          textAnchor="middle"
          fill={labelColor(base)}
          fontSize="36"
          fontFamily="Arial, sans-serif"
          fontWeight="700"
        >
          {name}
        </text>
      </svg>
      <p className={styles.hint}>{copy.keychainHint}</p>
      <label className={styles.approval}>
        <input
          type="checkbox"
          checked={approved}
          disabled={!canApprove}
          onChange={(e) => onApprove(e.target.checked)}
        />
        {copy.keychainApprove}
      </label>
    </section>
  );
}
