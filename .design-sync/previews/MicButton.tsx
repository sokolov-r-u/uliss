import {Kicker, MicButton} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const Stage = ({variant, caption}: { variant: 'solid' | 'ring' | 'pulse'; caption: string }) => (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 32px'}}>
        <MicButton variant={variant} size={96}/>
        <div style={{marginTop: 30}}><Kicker size={10} spacing="3.5px">{caption}</Kicker></div>
    </div>
)

export const States = () => (
    <Ground>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            <Stage variant="solid" caption="Tap to speak"/>
            <Stage variant="ring" caption="Listening"/>
            <Stage variant="pulse" caption="Recording"/>
        </div>
    </Ground>
)

export const Hero = () => (
    <Ground>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0'}}>
            <MicButton variant="solid" size={138}/>
            <div style={{marginTop: 30}}><Kicker size={10} spacing="3.5px">Tap to speak</Kicker></div>
        </div>
    </Ground>
)

export const Disabled = () => (
    <Ground>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0'}}>
            <MicButton variant="solid" size={96} disabled/>
            <div style={{marginTop: 30}}><Kicker size={10} spacing="3.5px" color="var(--text-faint)">Voice coming
                soon</Kicker></div>
        </div>
    </Ground>
)
