import {FieldMessage} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Tones = () => (
    <Ground width={260}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <FieldMessage tone="hint" text="JPG, PNG, WebP or GIF, at least 300 px"/>
            <FieldMessage tone="busy" text="Loading preview…"/>
            <FieldMessage tone="ok" text="1200 × 1800 px — shown exactly like this"/>
            <FieldMessage tone="error" text="Too small: 120 × 180 px, needs at least 300 px"/>
        </div>
    </Ground>
)
