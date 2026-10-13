import {Kicker, StarField, Wordmark} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const SignInSky = () => (
    <Ground pad={0} width={300} style={{background: 'var(--bg-deep)'}}>
        <div style={{position: 'relative', height: 540}}>
            <div style={{position: 'absolute', inset: 0, zIndex: 0}}>
                <StarField id="preview-auth" count={460} aspect={0.55} fadeStart={0.38}/>
            </div>
            <div style={{position: 'relative', zIndex: 1, paddingTop: 200, textAlign: 'center'}}>
                <Wordmark size={48} color="var(--wordmark-login)"/>
            </div>
        </div>
    </Ground>
)

export const WideBand = () => (
    <Ground pad={0} width={520} style={{background: 'var(--bg-deep)'}}>
        <div style={{position: 'relative', height: 260}}>
            <div style={{position: 'absolute', inset: 0, zIndex: 0}}>
                <StarField id="preview-band" count={220} aspect={2} nebula/>
            </div>
            <div style={{position: 'relative', zIndex: 1, padding: 24}}>
                <Kicker size={10} spacing="4px">Your sky</Kicker>
            </div>
        </div>
    </Ground>
)
