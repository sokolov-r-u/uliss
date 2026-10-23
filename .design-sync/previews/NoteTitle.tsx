import {NoteTitle} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const line = {fontFamily: 'var(--font-text)', fontSize: 14, color: 'var(--cream)', padding: '6px 0'}

export const InAList = () => (
    <Ground width={320} pad={18}>
        <div style={line}><NoteTitle title="Giant Steps" icon="🎷" slot/></div>
        <div style={line}><NoteTitle title="Notes on forgetting" icon={null} slot/></div>
        <div style={line}><NoteTitle title="Family dinner" icon="👨‍👩‍👧" slot/></div>
    </Ground>
)

export const Alone = () => (
    <Ground width={320} pad={18}>
        <h2 style={{...line, fontSize: 22, margin: 0}}><NoteTitle title="Giant Steps" icon="🎷"/></h2>
        <h2 style={{...line, fontSize: 22, margin: 0}}><NoteTitle title="Notes on forgetting"/></h2>
    </Ground>
)
