import type { CSSProperties } from 'react';

export interface WordmarkProps {
  /** Display size in px. Default: 120 */
  size?: number;
  /** Font family variant. Default: 'IM Fell English' */
  font?: 'IM Fell English' | 'Marcellus' | 'Cinzel';
  /** Additional inline styles */
  style?: CSSProperties;
}

const families: Record<NonNullable<WordmarkProps['font']>, string> = {
  'IM Fell English': "'IM Fell English', serif",
  Marcellus: "'Marcellus', serif",
  Cinzel: "'Cinzel', serif",
};

/** Brand wordmark — ochre→terracotta gradient logotype. */
export function Wordmark({ size = 120, font = 'IM Fell English', style = {} }: WordmarkProps) {
  return (
    <span
      style={{
        fontFamily: families[font] ?? families['IM Fell English'],
        fontSize: size,
        fontWeight: font === 'Cinzel' ? 700 : 400,
        lineHeight: 0.9,
        letterSpacing: '0.02em',
        color: 'transparent',
        background: 'linear-gradient(180deg,#ecbf72 0%,#dca455 34%,#c8643c 78%,#b8512e 100%)',
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
