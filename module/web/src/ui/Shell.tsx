import type { ReactNode } from 'react'
import { Wordmark, Kicker } from '@uliss/design-system'

/** Brand shell: meander-free minimal frame with the Wordmark header and a centred panel. */
export function Shell({
  kicker,
  children,
  actions,
}: {
  kicker?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="shell">
      <header className="shell-header">
        <Wordmark size={32} />
        {actions}
      </header>
      <main className="shell-main">
        <section className="panel">
          {kicker ? <Kicker>{kicker}</Kicker> : null}
          {children}
        </section>
      </main>
    </div>
  )
}
