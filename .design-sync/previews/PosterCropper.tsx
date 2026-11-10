import {type CropMode, fitCrop, PosterCropper} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const POSTER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#1b2433"/><stop offset="1" stop-color="#c8643c"/></linearGradient></defs>'
    + '<rect width="600" height="900" fill="url(#g)"/><circle cx="380" cy="300" r="90" fill="#e8d3a8"/></svg>')

const Cropper = ({initial, compact}: { initial: CropMode; compact?: boolean }) => {
    const [mode, setMode] = useState<CropMode>(initial)
    const [crop, setCrop] = useState(() => fitCrop(null, 600, 900))
    return <PosterCropper src={POSTER} imageWidth={600} imageHeight={900} mode={mode} onModeChange={setMode}
                          value={crop} onChange={setCrop} title="Dune sea" compact={compact}/>
}

export const PanelFrame = () => (
    <Ground width={680}><Cropper initial="poster"/></Ground>
)

export const SkyAvatar = () => (
    <Ground width={680}><Cropper initial="avatar"/></Ground>
)

export const Phone = () => (
    <Ground width={343}><Cropper initial="avatar" compact/></Ground>
)

export const Unavailable = () => (
    <Ground width={680}>
        <PosterCropper src={POSTER} status="unavailable" mode="poster" onModeChange={() => undefined}
                       value={fitCrop(null, 600, 900)} onChange={() => undefined}/>
    </Ground>
)

