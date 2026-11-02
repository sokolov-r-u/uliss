import {renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {useLinkedItems} from './useLinkedItems'

describe('useLinkedItems', () => {
    it('loads nothing for an empty id and loads once an id is given', async () => {
        const load = vi.fn((id: string) => Promise.resolve([`${id}-item`]))
        const {result, rerender} = renderHook(({id}) => useLinkedItems(id, load, []), {initialProps: {id: ''}})

        expect(load).not.toHaveBeenCalled()
        expect(result.current.status).toBe('loading')

        rerender({id: 'note-1'})

        await waitFor(() => expect(result.current.items).toEqual(['note-1-item']))
        expect(load).toHaveBeenCalledOnce()
    })
})
