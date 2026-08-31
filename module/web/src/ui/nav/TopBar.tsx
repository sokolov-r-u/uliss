import {Icon, Wordmark} from '@uliss/design-system'

/** Mobile-only bar: hamburger (opens the SideNav drawer) + centred wordmark. Hidden ≥ 900px. */
export function TopBar({onMenuClick}: { onMenuClick: () => void }) {
    return (
        <header className="top-bar">
            <button type="button" className="hamburger-btn" aria-label="Open menu" onClick={onMenuClick}>
                <Icon name="menu" size={20}/>
            </button>
            <span className="top-bar-wordmark">
                <Wordmark size={22}/>
            </span>
            <span className="top-bar-spacer" aria-hidden/>
        </header>
    )
}
