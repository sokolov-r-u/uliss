import type { CSSProperties } from 'react';

export interface DevRuleProps {
  /** Width in px. Default: 90 */
  width?: number;
  /** Top margin in px. Default: 24 */
  marginTop?: number;
  /** Bottom margin in px. Default: 24 */
  marginBottom?: number;
  style?: CSSProperties;
}

/** Decorative thin divider rule. */
export function DevRule({ width = 90, marginTop = 24, marginBottom = 24, style = {} }: DevRuleProps) {
  return (
    <hr
      style={{
        height: 1,
        background: 'var(--line-strong)',
        border: 0,
        width,
        marginTop,
        marginBottom,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
