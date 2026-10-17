import {EditorToolbar} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const noop = () => undefined

export const Editing = () => (
    <Ground width={520}>
        <EditorToolbar active={{bold: true, bulletList: true}} unavailable={{redo: true}} onCommand={noop}
                       original={false} onOriginalChange={noop}/>
    </Ground>
)

export const ShowingOriginal = () => (
    <Ground width={520}>
        <EditorToolbar onCommand={noop} original onOriginalChange={noop}/>
    </Ground>
)

export const Locked = () => (
    <Ground width={520}>
        <EditorToolbar onCommand={noop} original={false} onOriginalChange={noop} disabled/>
    </Ground>
)

export const Phone = () => (
    <Ground width={340}>
        <EditorToolbar onCommand={noop} original={false} onOriginalChange={noop}/>
    </Ground>
)
