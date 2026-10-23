import {EmojiPicker} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

// The app serves this file itself; the design preview has no app server, so it reads the same package from the CDN.
const DATA = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1.8.0/en/emojibase/data.json'

export const WithAnIcon = () => {
    const [icon, setIcon] = useState<string | null>('🎷')
    return <Ground pad={28}>
        <EmojiPicker dataSource={DATA} onPick={setIcon} onRemove={icon ? () => setIcon(null) : undefined}/>
    </Ground>
}

export const NoIconYet = () => {
    const [, setIcon] = useState<string | null>(null)
    return <Ground pad={28}>
        <EmojiPicker dataSource={DATA} onPick={setIcon}/>
    </Ground>
}
