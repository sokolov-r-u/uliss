import {Wordmark} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const InApp = () => (
    <Ground>
        <Wordmark size={34}/>
    </Ground>
)

export const SignIn = () => (
    <Ground style={{background: 'var(--bg-deep)'}}>
        <Wordmark size={52} color="var(--wordmark-login)"/>
    </Ground>
)

export const Sizes = () => (
    <Ground>
        <div style={{display: 'flex', gap: 28, alignItems: 'baseline'}}>
            <Wordmark size={26}/>
            <Wordmark size={34}/>
            <Wordmark size={44}/>
        </div>
    </Ground>
)
