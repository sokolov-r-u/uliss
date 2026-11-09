import {PosterFrame} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const POSTER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#1b2433"/><stop offset="1" stop-color="#c8643c"/></linearGradient></defs>'
    + '<rect width="200" height="300" fill="url(#g)"/><circle cx="140" cy="80" r="26" fill="#e8d3a8"/></svg>')

export const States = () => (
    <Ground width={760}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12}}>
            <PosterFrame state="hint"/>
            <PosterFrame state="loading"/>
            <PosterFrame state="image" src={POSTER} alt="Dune sea poster"/>
            <PosterFrame state="small" src={POSTER} badge="120 × 180"/>
            <PosterFrame state="broken"/>
            <PosterFrame state="unavailable" host="images.example.com"/>
        </div>
    </Ground>
)
