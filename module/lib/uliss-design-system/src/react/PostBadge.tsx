import type { CSSProperties } from 'react';

export interface PostBadgeProps {
  /** Post number (integer or string). Displayed as #001 format. */
  number: number | string;
  /** Zero-pad to 3 digits. Default: true */
  padded?: boolean;
  /** Font size in px. Default: 13 */
  size?: number;
  style?: CSSProperties;
}

/** Post number badge, e.g. #001. */
export function PostBadge({ number, padded = true, size = 13, style = {} }: PostBadgeProps) {
  const num = padded ? String(number).padStart(3, '0') : String(number);
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '3px',
        color: 'var(--ochre)',
        display: 'inline-block',
        ...style,
      }}
    >
      #{num}
    </span>
  );
}
