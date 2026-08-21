import {Wordmark} from '@uliss/design-system'
import {MenuIcon} from '../icons'

/** Mobile-only top bar: hamburger (opens the SideNav drawer) + centered wordmark. Hidden on desktop. */
export function TopBar({onMenuClick}: { onMenuClick: () => void }) {
    return (
        <header className="top-bar">
            <button type="button" className="hamburger-btn" aria-label="Open menu" onClick={onMenuClick}>
                <MenuIcon/>
            </button>
            <span className="top-bar-wordmark">
        <Wordmark size={22}/>
      </span>
            <span className="top-bar-spacer" aria-hidden/>
        </header>
    )
}
