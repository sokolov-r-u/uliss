import type { CSSProperties, ReactNode } from 'react';

export interface KickerProps {
  children: ReactNode;
  /** Font size in px. Default: 13 */
  size?: number;
  /** Letter-spacing CSS value. Default: '5px' */
  spacing?: string;
  /** CSS color. Default: var(--cream-dim) */
  color?: string;
  style?: CSSProperties;
}

/** ALL CAPS mono label with wide tracking. */
export function Kicker({
  children,
  size = 13,
  spacing = '5px',
  color = 'var(--cream-dim)',
  style = {},
}: KickerProps) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 500,
        fontSize: size,
        letterSpacing: spacing,
        textTransform: 'uppercase',
        color,
        display: 'inline-block',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
