import type {CSSProperties} from 'react';

export interface WordmarkProps {
  /** Display size in px. Default: 120 */
  size?: number;
  /** Additional inline styles */
  style?: CSSProperties;
}

/** Brand wordmark — IM Fell English logotype with the ochre→terracotta gradient. */
export function Wordmark({size = 120, style = {}}: WordmarkProps) {
  return (
    <span
      style={{
          fontFamily: "var(--font-display, 'IM Fell English', serif)",
        fontSize: size,
          fontWeight: 400,
        lineHeight: 0.9,
        letterSpacing: '0.02em',
        color: 'transparent',
          background:
              'var(--gradient-wordmark, linear-gradient(180deg,#ecbf72 0%,#dca455 34%,#c8643c 78%,#b8512e 100%))',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        display: 'inline-block',
        ...style,
      }}
    >
      Uliss
    </span>
  );
}
