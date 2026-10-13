import {Button, Icon} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Variants = () => (
    <Ground>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
            <Button variant="primary">Continue</Button>
            <Button variant="outline">Start a chat</Button>
            <Button variant="quiet">New note</Button>
            <Button variant="ghost">Not now</Button>
        </div>
    </Ground>
)

export const Sizes = () => (
    <Ground>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
            <Button variant="outline" size="sm">Link</Button>
            <Button variant="outline" size="md">Start a chat</Button>
            <Button variant="outline" size="lg">Begin writing</Button>
        </div>
    </Ground>
)

export const WithIcon = () => (
    <Ground>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
            <Button variant="quiet" icon={<Icon name="plus" size={13}/>}>New note</Button>
            <Button variant="outline" icon={<Icon name="chatBubble" size={13}/>}>Start a chat</Button>
        </div>
    </Ground>
)

export const FullWidthTouchTarget = () => (
    <Ground width={340}>
        <Button variant="primary" size="lg" full>Continue</Button>
    </Ground>
)

export const Disabled = () => (
    <Ground>
        <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
            <Button variant="outline" disabled>Saving…</Button>
            <Button variant="quiet" disabled>New note</Button>
        </div>
    </Ground>
)
