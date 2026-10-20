import {Kicker} from '@uliss/design-system'
import type {SkySettings} from './skySettings'

const MODES: { id: SkySettings['labels']; label: string; hint: string }[] = [
    {id: 'always', label: 'Always', hint: 'Every name, at any zoom'},
    {id: 'auto', label: 'Auto', hint: 'Names appear as you zoom in'},
    {id: 'off', label: 'Off', hint: 'The shape only'},
]

const REACHES: { id: SkySettings['nearReach']; label: string }[] = [
    {id: 'close', label: 'Close'}, {id: 'medium', label: 'Medium'}, {id: 'wide', label: 'Wide'}, {id: 'vast', label: 'Vast'},
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
        <button type="button" className="sky-menu-scrim" data-sky-ui="" tabIndex={-1} aria-hidden="true"
                onClick={onClose}/>
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
            <label className="sky-names-density">
                <span>Near the pointer · {settings.nearCount === 0 ? 'Off' : settings.nearCount}</span>
                <input type="range" min={0} max={10} step={1} value={settings.nearCount}
                       onChange={(event) => onSettings({nearCount: Number(event.target.value)})}/>
                <span className="sky-names-ends"><span>Off</span><span>10</span></span>
            </label>
            {settings.nearCount > 0 && <div className="sky-names-reach" role="group" aria-label="Reach">
                <span>Reach</span>
                <div>{REACHES.map((reach) => <button key={reach.id} type="button"
                                                     aria-pressed={settings.nearReach === reach.id}
                                                     className={settings.nearReach === reach.id ? 'on' : undefined}
                                                     onClick={() => onSettings({nearReach: reach.id})}>{reach.label}</button>)}</div>
            </div>}
            {settings.labels === 'auto' && <label className="sky-names-density">
                <span>How many names</span>
                <input type="range" min={0} max={100} step={5} value={settings.labelDensity}
                       onChange={(event) => onSettings({labelDensity: Number(event.target.value)})}/>
                <span className="sky-names-ends"><span>Fewer</span><span>More</span></span>
            </label>}
        </div>
    </>
}
