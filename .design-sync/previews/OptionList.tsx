import {OptionList} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const OnboardingRadio = () => {
    const [picked, setPicked] = useState(0)
    return (
        <Ground width={320}>
            <OptionList label="Why are you here" marker="dot" selected={picked} onPick={setPicked}
                        options={['To think out loud', 'To keep a journal', 'Just curious']}/>
        </Ground>
    )
}

export const TickRows = () => {
    const [picked, setPicked] = useState(1)
    return (
        <Ground width={320}>
            <OptionList label="Reply language" marker="tick" selected={picked} onPick={setPicked}
                        options={[{label: 'English', note: 'Uliss replies in English'},
                            {label: 'Русский', note: 'Uliss отвечает по-русски'}]}/>
        </Ground>
    )
}

export const Disabled = () => (
    <Ground width={320}>
        <OptionList label="Tidy pace" marker="dot" selected={1} disabled
                    options={['Every night', 'Once a week', 'Only when I ask']}/>
    </Ground>
)
