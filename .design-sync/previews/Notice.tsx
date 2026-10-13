import {Notice, OptionList, TextField} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const OnboardingName = () => {
    const [name, setName] = useState('Wayf')
    return (
        <Ground pad={28}>
            <Notice blocking variant="framed" progress={{current: 1, total: 3}}
                    title="What should Uliss call you?" primary="Continue" skip="Later" onSkip={() => undefined}
                    onPrimary={() => undefined}>
                <TextField label="Name" placeholder="Wayfarer" value={name} maxLength={24}
                           onChange={(e) => setName(e.target.value)}/>
            </Notice>
        </Ground>
    )
}

export const Minimal = () => (
    <Ground pad={28}>
        <Notice variant="minimal" title="Uliss reorganised four notes last night"
                body="Nothing was deleted. You can undo any of it from Updates." primary="See what changed"
                secondary="Dismiss" onPrimary={() => undefined} onSecondary={() => undefined}/>
    </Ground>
)

export const PlaqueWithChoice = () => {
    const [pace, setPace] = useState(1)
    return (
        <Ground pad={28}>
            <Notice variant="plaque" title="How often should Uliss tidy your notes?"
                    primary="Save" showClose onClose={() => undefined} onPrimary={() => undefined}>
                <OptionList label="Tidy pace" marker="dot" selected={pace} onPick={setPace}
                            options={['Every night', 'Once a week', 'Only when I ask']}/>
            </Notice>
        </Ground>
    )
}
