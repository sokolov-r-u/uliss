import type {ReactNode} from 'react'
import {Kicker} from '../brand/Kicker'
import {Greek} from '../brand/Greek'

// The one label row in the product. Two shapes of the same thing:
//   rule    — kicker, then a hairline eating the remaining width (section
//             dividers in settings and side panels)
//   default — kicker left, gloss or live value right, on a shared baseline
//             (the label above every field)
// Merged from FieldLabel (forms) + SectionLabel (layout), which differed only
// in what sat to the right of the kicker.

export interface LabelRowProps {
    /** The label text. `children` works too, for the divider form. */
    label?: string
    children?: ReactNode
    /** Decorative gloss — onboarding surfaces only. Ignored when `rule`. */
    greek?: string
    /** Overrides `greek`: a counter, a unit, a "Clear". Ignored when `rule`. */
    right?: ReactNode
    /** Divider form — hairline to the right edge instead of a right slot. */
    rule?: boolean
    /** Override the kicker tracking. Defaults: 3px with `rule`, 2px without. */
    spacing?: string
}

export function LabelRow({label, children, greek, right, rule = false, spacing}: LabelRowProps) {
    const text = label != null ? label : children
    return (
        <div
            style={{
                display: 'flex',
                gap: rule ? 10 : 12,
                alignItems: rule ? 'center' : 'baseline',
                justifyContent: rule ? 'flex-start' : 'space-between',
                padding: rule ? '0 0 9px' : 0,
                marginBottom: rule ? 0 : 7,
            }}
        >
            <Kicker size={8.5} spacing={spacing || (rule ? '3px' : '2px')} color="var(--text-muted)">
                {text}
            </Kicker>
            {rule ? (
                <span style={{flex: 1, height: 1, background: 'var(--line)'}}/>
            ) : right != null ? (
                right
            ) : greek ? (
                <Greek size={12}>{greek}</Greek>
            ) : null}
        </div>
    )
}
