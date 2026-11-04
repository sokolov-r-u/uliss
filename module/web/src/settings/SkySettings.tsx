import {SkySettingsPanel} from '../sky/SkySettingsPanel'
import {DEFAULT_SKY_SETTINGS} from '../sky/skySettings'
import {useSkySettings} from '../sky/useSkySettings'
import {SettingsShell} from './SettingsShell'
import {useMessages} from '@uliss/design-system'
import {commonMessages} from '../i18n/common.messages'

/** Settings › Sky — the same panel as the sheet over the sky; both write the device's sky settings. */
export function SkySettings() {
    const [settings, patch, replace] = useSkySettings()
    const common = useMessages(commonMessages)
    return (
        <SettingsShell kicker={common.sky}>
            <SkySettingsPanel settings={settings} onSettings={patch} onReset={() => replace(DEFAULT_SKY_SETTINGS)}/>
        </SettingsShell>
    )
}
