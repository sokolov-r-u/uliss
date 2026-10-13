import {Greek, Kicker} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const BesideLabel = () => (
    <Ground width={340}>
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
            <Kicker size={9} spacing="3px">Name</Kicker>
            <Greek>ὄνομα</Greek>
        </div>
    </Ground>
)

export const Glosses = () => (
    <Ground width={340}>
        <div style={{display: 'grid', gap: 14}}>
            {[['Name', 'ὄνομα'], ['Sex', 'γένος'], ['Birth year', 'γένεσις'], ['Language', 'γλῶσσα']].map(([l, g]) => (
                <div key={l} style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
                    <Kicker size={9} spacing="3px">{l}</Kicker>
                    <Greek>{g}</Greek>
                </div>
            ))}
        </div>
    </Ground>
)

export const Sizes = () => (
    <Ground>
        <div style={{display: 'flex', gap: 24, alignItems: 'baseline'}}>
            <Greek size={13}>ἄστρον</Greek>
            <Greek size={16}>ἄστρον</Greek>
            <Greek size={22}>ἄστρον</Greek>
        </div>
    </Ground>
)
