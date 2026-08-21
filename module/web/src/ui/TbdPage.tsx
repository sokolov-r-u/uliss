import {Kicker} from '@uliss/design-system'

/** Shared empty-state shell for design areas with no backend yet — real page chrome, no fabricated data. */
export function TbdPage({kicker, title, description}: { kicker: string; title: string; description: string }) {
    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <Kicker size={9} spacing="3px">{kicker}</Kicker>
                    <h1 className="page-title">{title}</h1>
                </div>
            </div>
            <p className="page-description">{description}</p>
            <span className="tbd-badge">to be developed</span>
        </div>
    )
}
