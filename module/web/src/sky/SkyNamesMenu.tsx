import {Kicker, useMessages} from '@uliss/design-system'
import {skyMessages} from './sky.messages'
import {skySettingsMessages} from './skySettings.messages'
import type {SkySettings} from './skySettings'

const MODES: { id: SkySettings['labels']; hint: 'alwaysHint' | 'autoHint' | 'offHint' }[] = [
    {id: 'always', hint: 'alwaysHint'},
    {id: 'auto', hint: 'autoHint'},
    {id: 'off', hint: 'offHint'},
]

const REACHES: SkySettings['nearReach'][] = ['close', 'medium', 'wide', 'vast']

/**
 * Names, where the user is looking at them: the same three choices as Settings › Sky plus, for Auto, how hard the sky
 * tries to fit names in. Writes straight into the sky settings.
 */
export function SkyNamesMenu({settings, onSettings, onClose}: {
    settings: SkySettings
    onSettings: (patch: Partial<SkySettings>) => void
    onClose: () => void
}) {
    const t = useMessages(skyMessages)
    const words = useMessages(skySettingsMessages)
    return <>
        <button type="button" className="sky-menu-scrim" data-sky-ui="" tabIndex={-1} aria-hidden="true"
                onClick={onClose}/>
        <div className="sky-names" data-sky-ui="" role="group" aria-label={t.names}
             onKeyDown={(event) => {
                 if (event.key === 'Escape') onClose()
             }}>
            <Kicker size={8.5} spacing="2.6px" color="var(--accent)">{t.names}</Kicker>
            <div className="sky-names-modes">
                {MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={settings.labels === mode.id}
                                             className={settings.labels === mode.id ? 'sky-names-mode on' : 'sky-names-mode'}
                                             onClick={() => onSettings({labels: mode.id})}>
                    <span>{words[mode.id]}</span><small>{t[mode.hint]}</small>
                </button>)}
            </div>
            <label className="sky-names-density">
                <span>{t.nearPointer(settings.nearCount === 0 ? words.off : String(settings.nearCount))}</span>
                <input type="range" min={0} max={10} step={1} value={settings.nearCount}
                       onChange={(event) => onSettings({nearCount: Number(event.target.value)})}/>
                <span className="sky-names-ends"><span>{words.off}</span><span>10</span></span>
            </label>
            {settings.nearCount > 0 && <div className="sky-names-reach" role="group" aria-label={words.reach}>
                <span>{words.reach}</span>
                <div>{REACHES.map((reach) => <button key={reach} type="button"
                                                     aria-pressed={settings.nearReach === reach}
                                                     className={settings.nearReach === reach ? 'on' : undefined}
                                                     onClick={() => onSettings({nearReach: reach})}>{words[reach]}</button>)}</div>
            </div>}
            {settings.labels === 'auto' && <label className="sky-names-density">
                <span>{words.howMany}</span>
                <input type="range" min={0} max={100} step={5} value={settings.labelDensity}
                       onChange={(event) => onSettings({labelDensity: Number(event.target.value)})}/>
                <span className="sky-names-ends"><span>{words.fewer}</span><span>{words.more}</span></span>
            </label>}
        </div>
    </>
}
