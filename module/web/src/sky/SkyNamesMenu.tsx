import {Kicker} from '@uliss/design-system'
import type {SkySettings} from './skySettings'

const MODES: { id: SkySettings['labels']; label: string; hint: string }[] = [
    {id: 'always', label: 'Always', hint: 'Every name, at any zoom'},
    {id: 'auto', label: 'Auto', hint: 'Names appear as you zoom in'},
    {id: 'off', label: 'Off', hint: 'The shape only'},
]

/**
 * Names, where the user is looking at them: the same three choices as Settings › Sky plus, for Auto, how hard the sky
 * tries to fit names in. Writes straight into the sky settings.
 */
export function SkyNamesMenu({settings, onSettings, onClose}: {
    settings: SkySettings
    onSettings: (patch: Partial<SkySettings>) => void
    onClose: () => void
}) {
    return <>
        <div className="sky-menu-scrim" data-sky-ui="" onClick={onClose}/>
        <div className="sky-names" data-sky-ui="" role="group" aria-label="Names"
             onKeyDown={(event) => {
                 if (event.key === 'Escape') onClose()
             }}>
            <Kicker size={8.5} spacing="2.6px" color="var(--accent)">Names</Kicker>
            <div className="sky-names-modes">
                {MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={settings.labels === mode.id}
                                             className={settings.labels === mode.id ? 'sky-names-mode on' : 'sky-names-mode'}
                                             onClick={() => onSettings({labels: mode.id})}>
                    <span>{mode.label}</span><small>{mode.hint}</small>
                </button>)}
            </div>
            {settings.labels === 'auto' && <label className="sky-names-density">
                <span>How many names</span>
                <input type="range" min={0} max={100} step={5} value={settings.labelDensity}
                       onChange={(event) => onSettings({labelDensity: Number(event.target.value)})}/>
                <span className="sky-names-ends"><span>Fewer</span><span>More</span></span>
            </label>}
        </div>
    </>
}
