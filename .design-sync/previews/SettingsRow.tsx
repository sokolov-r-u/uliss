import {SettingsRow} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const SettingsList = () => (
    <Ground width={360}>
        <SettingsRow first label="Appearance" hint="Obsidian · Ochre · Regular" active/>
        <SettingsRow label="Sky" hint="Focus · colour by constellation"/>
        <SettingsRow label="Account" hint="Wayfarer · born Mar 1991"/>
        <SettingsRow label="Language" hint="English · Uliss replies in English"/>
    </Ground>
)

export const Unavailable = () => (
    <Ground width={360}>
        <SettingsRow first label="Voice" hint="Off · coming later" disabled/>
    </Ground>
)
