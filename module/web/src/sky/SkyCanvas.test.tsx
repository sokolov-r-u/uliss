import {act, fireEvent, render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {Sky} from '../constellations/constellationApi'
import {SkyCanvas} from './SkyCanvas'
import {skyMemory} from './skyMemory'
import {buildSkyGraph, subgraph} from './skyModel'
import {DEFAULT_SKY_SETTINGS, type SkySettings, skyPhysics} from './skySettings'

const SKY: Sky = {
    constellations: [{id: 'music', parentId: null, name: 'Music', hue: 264, lightness: 'BASE', noteCount: 3, ownNoteCount: 3}],
    notes: [
        {id: 'bowie', title: 'Bowie', parentNoteId: null, createdAt: '2026-10-20T10:00:00Z',
            memberships: [{constellationId: 'music', main: true}]},
        {id: 'low', title: 'Low', parentNoteId: 'bowie', createdAt: '2026-10-20T11:00:00Z', memberships: []},
        {id: 'loose', title: 'Loose thought', parentNoteId: null, createdAt: '2026-10-20T12:00:00Z', memberships: []},
    ],
}

function renderCanvas(settings: Partial<SkySettings> = {}, onPickStar = vi.fn(), onExitFocus = vi.fn(),
                      view: 'full' | 'focus' = 'full') {
    const graph = buildSkyGraph(SKY)
    const all = {...DEFAULT_SKY_SETTINGS, ...settings}
    render(<SkyCanvas graph={graph} sub={subgraph(graph, view, view === 'focus' ? 'music' : null, 3)} view={view}
                      filter={null} settings={all} physics={skyPhysics(all)} selectedId={null} onPickStar={onPickStar}
                      onFocus={vi.fn()} onExitFocus={onExitFocus} onSettings={vi.fn()} panelOpen={false} footer={null}/>)
    return onPickStar
}

/** Where a node is painted: its first circle's centre, in the frame's (here: client) px. */
function at(name: string) {
    const circle = screen.getByRole('button', {name}).querySelector('circle')!
    return {clientX: Number(circle.getAttribute('cx')), clientY: Number(circle.getAttribute('cy'))}
}

const frame = () => document.querySelector('.sky-frame')!
const named = (label: string) => [...document.querySelectorAll('text.sky-name')].some((t) => t.textContent === label)

describe('SkyCanvas', () => {
    beforeEach(() => {
        skyMemory.canvas = null
    })

    it('a narrow sky hides star names until the mouse comes near; then the star under it and its neighbours are named', () => {
        renderCanvas()
        expect(named('Bowie')).toBe(false)

        fireEvent.pointerMove(frame(), {...at('Bowie'), pointerType: 'mouse'})

        expect(named('Bowie')).toBe(true)
        expect(document.querySelector('text.sky-name.hovered')?.textContent).toBe('Bowie')

        fireEvent.pointerLeave(frame())
        expect(named('Bowie')).toBe(false)
    })

    it('names nobody near the mouse when the count is 0, except the star under it', () => {
        renderCanvas({nearCount: 0})
        const bowie = at('Bowie')
        // a point a little off the star, within reach but outside its hit circle
        fireEvent.pointerMove(frame(), {clientX: bowie.clientX + 20, clientY: bowie.clientY + 20, pointerType: 'mouse'})

        expect(named('Bowie')).toBe(false)
    })

    it('the mouse on an edge lights up and names the two nodes it joins', () => {
        renderCanvas({nearCount: 0})
        const a = at('Bowie')
        const b = at('Low')
        fireEvent.pointerMove(frame(), {
            clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2, pointerType: 'mouse',
        })

        expect(named('Bowie')).toBe(true)
        expect(named('Low')).toBe(true)
    })

    it('a press that barely moves is a click; a real drag is not', () => {
        const onPick = renderCanvas()
        const bowie = screen.getByRole('button', {name: 'Bowie'})
        const start = at('Bowie')

        fireEvent.pointerDown(bowie, {...start, pointerId: 1})
        fireEvent.pointerMove(frame(), {clientX: start.clientX + 3, clientY: start.clientY, pointerId: 1})
        fireEvent.pointerUp(frame(), {pointerId: 1})
        fireEvent.click(bowie)
        expect(onPick).toHaveBeenCalledWith('bowie')

        onPick.mockClear()
        fireEvent.pointerDown(bowie, {...start, pointerId: 2})
        fireEvent.pointerMove(frame(), {clientX: start.clientX + 40, clientY: start.clientY, pointerId: 2})
        fireEvent.pointerUp(frame(), {pointerId: 2})
        fireEvent.click(bowie)
        expect(onPick).not.toHaveBeenCalled()
    })

    it('splits a star of several constellations into sectors only when Mix colours is on', () => {
        const sky: Sky = {
            constellations: [...SKY.constellations,
                {id: 'films', parentId: null, name: 'Films', hue: 22, lightness: 'BASE', noteCount: 1, ownNoteCount: 1}],
            notes: [{...SKY.notes[0], memberships: [{constellationId: 'music', main: true}, {constellationId: 'films', main: false}]}],
        }
        const graph = buildSkyGraph(sky)
        const draw = (mixColours: boolean) => {
            const settings = {...DEFAULT_SKY_SETTINGS, mixColours}
            return render(<SkyCanvas graph={graph} sub={subgraph(graph, 'full')} view="full" filter={null}
                                     settings={settings} physics={skyPhysics(settings)} selectedId={null}
                                     onPickStar={vi.fn()} onFocus={vi.fn()} onExitFocus={vi.fn()}
                                     onSettings={vi.fn()} panelOpen={false} footer={null}/>)
        }
        const off = draw(false)
        expect(screen.getByRole('button', {name: 'Bowie'}).querySelectorAll('path')).toHaveLength(0)
        off.unmount()
        draw(true)
        expect(screen.getByRole('button', {name: 'Bowie'}).querySelectorAll('path')).toHaveLength(2)
    })
})

describe('SkyCanvas keyboard', () => {
    beforeEach(() => {
        skyMemory.canvas = null
    })

    const nodes = () => [...document.querySelectorAll<SVGGElement>('g.sky-node.pickable')]
    const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
    const tab = (target: Element, shiftKey = false) => fireEvent.keyDown(target, {key: 'Tab', shiftKey})

    it('is one Tab stop, whatever the number of stars', () => {
        renderCanvas()

        const stops = nodes().filter((node) => node.tabIndex === 0)
        expect(stops).toHaveLength(1)
        expect(stops[0]).toHaveAttribute('data-sky-entry')
    })

    it('sends Tab and Shift+Tab from anywhere on the screen to the graph, and keeps them there', () => {
        renderCanvas()
        const outside = document.body.appendChild(document.createElement('button'))
        outside.focus()

        expect(tab(outside)).toBe(false)
        const entry = document.querySelector<SVGGElement>('[data-sky-entry]')!
        expect(entry).toHaveFocus()

        expect(tab(entry, true)).toBe(false)
        expect(entry).toHaveFocus()
        outside.remove()
    })

    it('keeps the normal Tab order when the sky has nothing to pick', () => {
        const graph = buildSkyGraph({constellations: [], notes: []})
        render(<SkyCanvas graph={graph} sub={subgraph(graph, 'full')} view="full" filter={null}
                          settings={DEFAULT_SKY_SETTINGS} physics={skyPhysics(DEFAULT_SKY_SETTINGS)} selectedId={null}
                          onPickStar={vi.fn()} onFocus={vi.fn()} onExitFocus={vi.fn()} onSettings={vi.fn()}
                          panelOpen={false} footer={null}/>)
        const outside = document.body.appendChild(document.createElement('button'))
        outside.focus()

        expect(tab(outside)).toBe(true)
        outside.remove()
    })

    it('leaves Tab to an open panel of the sky', () => {
        renderCanvas()
        const panel = document.body.appendChild(document.createElement('aside'))
        panel.className = 'sky-panel'
        const control = panel.appendChild(document.createElement('button'))
        control.focus()

        expect(tab(control)).toBe(true)
        expect(control).toHaveFocus()
        panel.remove()
    })

    it('moves focus with the arrows to a star on that side and names it instead', async () => {
        renderCanvas()
        const bowie = screen.getByRole('button', {name: 'Bowie'})
        act(() => bowie.focus())
        expect(named('Bowie')).toBe(true)

        const right = at('Loose thought').clientX > at('Bowie').clientX
        fireEvent.keyDown(bowie, {key: right ? 'ArrowRight' : 'ArrowLeft'})
        await nextFrame()

        const focused = document.activeElement as SVGGElement
        expect(focused).not.toBe(bowie)
        const label = focused.getAttribute('aria-label')!.replace(/^Focus on /, '')
        const moved = Number(focused.querySelector('circle')!.getAttribute('cx')) - at('Bowie').clientX
        expect(right ? moved : -moved).toBeGreaterThan(0)
        expect(named(label)).toBe(true)
        expect(named('Bowie')).toBe(false)
        expect(focused.tabIndex).toBe(0)
    })

    it('Escape leaves Focus first, then the star', () => {
        const onExitFocus = vi.fn()
        renderCanvas({}, vi.fn(), onExitFocus, 'focus')
        const music = screen.getByRole('button', {name: 'Focus on Music'})
        music.focus()

        fireEvent.keyDown(music, {key: 'Escape'})
        expect(onExitFocus).toHaveBeenCalledOnce()
        expect(music).toHaveFocus()
    })

    it('Escape in the whole sky takes focus off the star', () => {
        renderCanvas()
        const bowie = screen.getByRole('button', {name: 'Bowie'})
        bowie.focus()

        fireEvent.keyDown(bowie, {key: 'Escape'})
        expect(bowie).not.toHaveFocus()
    })
})
