import {ConstellationColorEditor} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const RootHue = () => (
    <Ground width={300} pad={0}>
        <ConstellationColorEditor mode="hue" name="Music" hue={264} onSave={() => undefined}
                                  onClose={() => undefined}/>
    </Ground>
)

export const SubLightness = () => (
    <Ground width={300} pad={0}>
        <ConstellationColorEditor mode="lightness" name="Jazz" hue={264} lightness="LIGHT" rootName="Music"
                                  onSave={() => undefined} onClose={() => undefined}/>
    </Ground>
)
