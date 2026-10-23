import {IconPicker, Notice, TextField} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

// The app serves this file itself; the design preview has no app server, so it reads the same package from the CDN.
const DATA = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1.8.0/en/emojibase/data.json'

function NameRow({initial}: { initial: string | null }) {
    const [icon, setIcon] = useState(initial)
    const [name, setName] = useState('Giant Steps')
    return <div style={{display: 'flex', alignItems: 'flex-end', gap: 8}}>
        <IconPicker label="Icon" value={icon} onChange={setIcon} dataSource={DATA}/>
        <div style={{flex: 1}}>
            <TextField label="Name" value={name} limit={50} onChange={(event) => setName(event.target.value)}/>
        </div>
    </div>
}

export const WithIcon = () => (
    <Ground width={360} pad={28}>
        <NameRow initial="🎷"/>
    </Ground>
)

export const WithoutIcon = () => (
    <Ground width={360} pad={28}>
        <NameRow initial={null}/>
    </Ground>
)

export const InANotice = () => (
    <Ground pad={28}>
        <div data-popover-root="">
            <Notice width={360} title="Create a summary note?" primary="Summarize" onPrimary={() => undefined}
                    showClose onClose={() => undefined}>
                <NameRow initial="🎷"/>
            </Notice>
        </div>
    </Ground>
)
