import {Kicker} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const ColourIsState = () => (
    <Ground>
        <div style={{display: 'grid', gap: 12}}>
            <Kicker size={9} spacing="3px" color="var(--accent)">Appearance</Kicker>
            <Kicker size={9} spacing="3px" color="var(--cream)">Account</Kicker>
            <Kicker size={9} spacing="3px" color="var(--cream-dim)">Notifications</Kicker>
            <Kicker size={9} spacing="2px" color="var(--text-faint)">3 new</Kicker>
        </div>
    </Ground>
)

export const SizeAndTracking = () => (
    <Ground>
        <div style={{display: 'grid', gap: 12}}>
            <Kicker size={12} spacing="2px">Journal</Kicker>
            <Kicker size={10.5} spacing="4px">Tap to speak</Kicker>
            <Kicker size={9} spacing="3px">Name</Kicker>
            <Kicker size={8.5} spacing="3px" color="var(--text-faint)">Jun 22 · 4 links</Kicker>
        </div>
    </Ground>
)
