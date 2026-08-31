// The "still thinking" line. Uliss computes a note's links after it saves, so
// any list of links has a window where it is legitimately empty — and an empty
// list must not read as "no links found". This shows instead: a 5px accent dot
// and a lowercase label, both pulsing on the shared 1.9s cycle (`.u-pending`,
// tokens/motion.css, silenced under prefers-reduced-motion).

export interface PendingLinksProps {
    /** Lowercase, with an ellipsis. 'looking for links…' */
    label?: string
    size?: number
    pad?: string
    minHeight?: number
}

export function PendingLinks({
                                 label = 'looking for links…',
                                 size = 10.5,
                                 pad = '11px 0',
                                 minHeight = 44,
                             }: PendingLinksProps) {
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 9, minHeight, padding: pad}}>
      <span
          className="u-pending"
          style={{
              width: 5,
              height: 5,
              flex: '0 0 5px',
              background: 'var(--accent)',
              boxShadow: '0 0 8px var(--accent-glow)',
          }}
      />
            <span
                className="u-pending"
                style={{
                    fontFamily: 'var(--font-text)',
                    fontSize: size,
                    letterSpacing: '1.4px',
                    color: 'var(--text-muted)',
                }}
            >
        {label}
      </span>
        </div>
    )
}
