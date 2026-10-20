import {useCallback, useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button, ConstellationPicker, EmptyState, Icon, IconButton, Kicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {getSky, type Sky} from '../constellations/constellationApi'
import {pickerItems} from '../constellations/constellationTree'
import {subscribeToNotesChanges} from '../notes/noteApi'
import {ScreenHeader} from '../ui/ScreenHeader'
import {SkyCanvas} from './SkyCanvas'
import {buildSkyGraph, defaultView, inBranch, type SkyView, subgraph} from './skyModel'
import {DEFAULT_SKY_SETTINGS, skyPhysics} from './skySettings'
import {SkySettingsPanel} from './SkySettingsPanel'
import {SkyStarPanel} from './SkyStarPanel'
import {skyMemory} from './skyMemory'
import {useSkySettings} from './useSkySettings'
import './sky.css'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; sky: Sky }

const SEEDS = [{left: '34%', top: '33%', r: 4, on: true}, {left: '63%', top: '24%', r: 3, on: false}]

/**
 * Sky: the constellation tree and every note as one live graph around YOU. Skeleton shows the constellations, a click
 * on one focuses it (Focus, depth 1–3; YOU leads out), Full shows everything. The layout is one for all three: a view
 * only hides and shows. A star, in any view, opens a panel with the note.
 */
export function SkyPage() {
    const navigate = useNavigate()
    const [load, setLoad] = useState<Load>({status: 'loading'})
    const [settings, patchSettings, replaceSettings] = useSkySettings()
    const physics = useMemo(() => skyPhysics(settings), [settings])
    const memory = skyMemory.screen
    const [view, setView] = useState<SkyView | null>(memory?.view ?? null)
    const [focusId, setFocusId] = useState<string | null>(memory?.focusId ?? null)
    const [lastFocus, setLastFocus] = useState<string | null>(memory?.lastFocus ?? null)
    const [depth, setDepth] = useState(memory?.depth ?? 2)
    const [filter, setFilter] = useState<string | null>(memory?.filter ?? null)
    const [filterOpen, setFilterOpen] = useState(false)
    const [starId, setStarId] = useState<string | null>(memory?.starId ?? null)
    const [settingsOpen, setSettingsOpen] = useState(memory?.settingsOpen ?? false)
    useEffect(() => {
        skyMemory.screen = {view, focusId, lastFocus, depth, filter, starId, settingsOpen}
    }, [view, focusId, lastFocus, depth, filter, starId, settingsOpen])
    // one panel slot: a picked star closes the settings, the gear closes the star
    const pickStar = (id: string) => {
        setSettingsOpen(false)
        setStarId(id)
    }

    const reload = useCallback(async (signal?: AbortSignal) => {
        try {
            const sky = await getSky(signal)
            setLoad({status: 'ready', sky})
        } catch (error) {
            if (error instanceof AuthRequiredError || signal?.aborted) return
            setLoad((current) => current.status === 'ready' ? current : {status: 'error'})
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        void reload(controller.signal)
        // A note written, renamed, moved or deleted in this tab joins the sky without a reload of the page.
        const unsubscribe = subscribeToNotesChanges(() => void reload())
        return () => {
            controller.abort()
            unsubscribe()
        }
    }, [reload])

    const sky = load.status === 'ready' ? load.sky : null
    const graph = useMemo(() => sky ? buildSkyGraph(sky) : null, [sky])

    // The first mode follows the density of the sky on this screen; after that it is the user's.
    useEffect(() => {
        if (graph && view == null) setView(defaultView(graph.nodes.length, window.innerWidth, window.innerHeight))
    }, [graph, view])

    // a focused constellation, the filter or the open star may vanish with a reload
    useEffect(() => {
        if (!graph) return
        if (focusId && !graph.byId.has(focusId)) {
            setFocusId(null)
            setView('skeleton')
        }
        if (lastFocus && !graph.byId.has(lastFocus)) setLastFocus(null)
        if (filter && !graph.byId.has(filter)) setFilter(null)
        if (starId && !graph.byId.has(starId)) setStarId(null)
    }, [graph, focusId, lastFocus, filter, starId])

    const shownView: SkyView = !graph || graph.starCount === 0 ? 'skeleton' : view ?? 'skeleton'
    const sub = useMemo(() => graph ? subgraph(graph, shownView, focusId, depth) : null, [graph, shownView, focusId, depth])

    const focus = (id: string) => {
        setFocusId(id)
        setLastFocus(id)
        setView('focus')
        setStarId(null)
    }
    const pickView = (next: SkyView) => setView(next)

    const branch = filter && graph ? graph.tree.byId.get(filter) : undefined
    const inFilter = graph && filter ? graph.nodes.filter((n) => n.kind === 'star' && inBranch(graph, n, filter)).length : 0

    const header = <ScreenHeader kicker="Sky" count={graph?.starCount}
                                 right={graph ? <span className="sky-head-actions">
                                     {branch && <button type="button" className="sky-filter-chip"
                                                        title="Show every constellation"
                                                        onClick={() => setFilter(null)}>
                                         {inFilter} of {graph.starCount} · {branch.name}<span aria-hidden> ×</span>
                                     </button>}
                                     {graph.tree.flat.length > 0 && <button type="button"
                                                                            className={filterOpen || filter ? 'sky-head-button on' : 'sky-head-button'}
                                                                            title="Filter by constellation"
                                                                            aria-expanded={filterOpen}
                                                                            onClick={() => setFilterOpen((open) => !open)}>
                                         <Icon name="filter" size={15}/>
                                     </button>}
                                     <button type="button" className={settingsOpen ? 'sky-head-button on' : 'sky-head-button'}
                                             title="Sky settings" aria-expanded={settingsOpen}
                                             onClick={() => {
                                                 setStarId(null)
                                                 setSettingsOpen((open) => !open)
                                             }}>
                                         <Icon name="gear" size={15}/>
                                     </button>
                                 </span> : undefined}/>

    if (load.status === 'loading') return <div className="product-view sky-view">{header}
        <div className="sky-stage"/>
    </div>

    if (load.status === 'error') return <div className="product-view sky-view">{header}
        <div className="sky-stage sky-state" role="alert">
            <p>Could not load the sky.</p>
            <Button size="sm" variant="quiet" onClick={() => {
                setLoad({status: 'loading'})
                void reload()
            }}>Retry</Button>
        </div>
    </div>

    if (!graph || !sub) return null

    if (graph.nodes.length === 1) return <div className="product-view sky-view">{header}
        <div className="product-body sky-stage">
            <div className="product-empty">
                {SEEDS.map((seed, index) => <span key={index} className={seed.on ? 'sky-seed on' : 'sky-seed'} style={{
                    left: seed.left, top: seed.top, width: seed.r * 2, height: seed.r * 2,
                }}/>)}
                <EmptyState title="Two stars are not a sky yet"
                            body="Every note you keep becomes a star here. Start a chat, then press Summarize — or grow a few constellations first."/>
            </div>
        </div>
    </div>

    const inFocus = shownView === 'focus'
    const footer = <>
        <div className="sky-modes" role="group" aria-label="Sky mode">
            {(['skeleton', 'full'] as const).map((id) => <button key={id} type="button" aria-pressed={shownView === id}
                                                                 className={shownView === id ? 'sky-mode on' : 'sky-mode'}
                                                                 disabled={graph.starCount === 0 && id === 'full'}
                                                                 onClick={() => pickView(id)}>
                {id === 'skeleton' ? 'Skeleton' : 'Full'}</button>)}
        </div>
        {inFocus && <div className="sky-depth" role="group" aria-label="Depth">
            <span>Depth</span>
            {[1, 2, 3].map((d) => <button key={d} type="button" aria-pressed={d === depth}
                                          className={d === depth ? 'on' : undefined}
                                          onClick={() => setDepth(d)}>{d}</button>)}
        </div>}
        <button type="button" className={inFocus ? 'sky-mode sky-focus on' : 'sky-mode sky-focus'}
                disabled={!inFocus && !lastFocus}
                title={inFocus ? 'Back to the whole sky' : 'Back to the last focus'}
                onClick={() => inFocus ? setView('skeleton') : lastFocus && focus(lastFocus)}>
            {inFocus ? 'Exit focus' : 'Focus'}</button>
    </>

    return <div className="product-view sky-view">
        {header}
        <div className="sky-stage">
            <SkyCanvas graph={graph} sub={sub} view={shownView} filter={filter}
                       settings={settings} physics={physics} selectedId={starId}
                       onPickStar={pickStar} onFocus={focus} onExitFocus={() => setView('skeleton')}
                       onSettings={patchSettings} panelOpen={starId != null || settingsOpen} footer={footer}/>
            {graph.starCount === 0 && <p className="sky-note">
                Notes you keep appear as stars in their constellations. Start a chat and press Summarize.</p>}
            {filterOpen && <>
                <div className="sky-menu-scrim" onClick={() => setFilterOpen(false)}/>
                <div className="sky-filter" data-sky-ui="">
                    <ConstellationPicker items={pickerItems(graph.tree)} label="Find a constellation"
                                         action={(name) => `Show ${name}`}
                                         lead={filter ? {
                                             label: 'All constellations', onSelect: () => {
                                                 setFilter(null)
                                                 setFilterOpen(false)
                                             },
                                         } : undefined}
                                         onPick={(id) => {
                                             setFilter(id)
                                             setFilterOpen(false)
                                         }}
                                         onClose={() => setFilterOpen(false)}/>
                </div>
            </>}
            {settingsOpen && <aside className="sky-panel" data-sky-ui="" aria-label="Sky settings"
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') setSettingsOpen(false)
                                    }}>
                <header className="sky-panel-head">
                    <Kicker size={9} spacing="3px" color="var(--accent)">Sky</Kicker>
                    <IconButton s={44} title="Close" onClick={() => setSettingsOpen(false)}>
                        <Icon name="close" size={15}/></IconButton>
                </header>
                <div className="sky-panel-body">
                    <SkySettingsPanel settings={settings} onSettings={patchSettings}
                                      onReset={() => replaceSettings(DEFAULT_SKY_SETTINGS)}/>
                </div>
            </aside>}
            {starId && <SkyStarPanel graph={graph} starId={starId} onClose={() => setStarId(null)}
                                     onOpen={(id) => navigate(`/notes/${id}`)} onPickStar={pickStar}
                                     onOpenChat={(chatId) => navigate(`/chats/${chatId}`)}
                                     onChanged={() => void reload()}/>}
        </div>
    </div>
}
