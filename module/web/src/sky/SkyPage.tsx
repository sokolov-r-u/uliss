import {EmptyState} from '@uliss/design-system'
import {Screen} from '../ui/Screen'

/**
 * Sky — the constellation map. No graph data or embeddings pipeline exists, so this is the
 * "two stars, not yet a sky" empty state (no action — an empty sky has nothing to press, per
 * `EmptyState.prompt.md`). Wave 9 adds the renderer.
 */
const SEEDS = [
    {left: '34%', top: '33%', r: 4, on: true},
    {left: '63%', top: '24%', r: 3, on: false},
]

export function SkyPage() {
    return (
        <Screen kicker="Sky" ground="var(--sky-bg)">
            <div className="screen-empty sky-empty">
                {SEEDS.map((s, i) => (
                    <span
                        key={i}
                        className="sky-seed"
                        style={{
                            left: s.left,
                            top: s.top,
                            width: s.r * 2,
                            height: s.r * 2,
                            background: s.on ? 'var(--accent)' : 'var(--cream-dim)',
                            boxShadow: s.on
                                ? '0 0 20px 2px var(--accent-glow)'
                                : '0 0 14px rgba(169, 165, 160, 0.4)',
                        }}
                    />
                ))}
                <EmptyState
                    title="Two stars are not a sky"
                    body="Uliss draws the map once you have three notes. Start a few chats, then press Summarize — it turns them into notes right away."
                />
            </div>
        </Screen>
    )
}
