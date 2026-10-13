import {describe, expect, it} from 'vitest'
import {groupByRecency} from './recency'

const now = new Date(2026, 5, 24, 15, 0)
const at = (month: number, day: number) => new Date(2026, month, day, 9, 0).toISOString()

describe('groupByRecency', () => {
    it('buckets items into Today · Yesterday · This week · This month · Earlier, keeping their order', () => {
        const items = [
            {id: 'a', date: at(5, 24)},
            {id: 'b', date: at(5, 23)},
            {id: 'c', date: at(5, 19)},
            {id: 'd', date: at(5, 2)},
            {id: 'e', date: at(4, 30)},
            {id: 'f', date: undefined},
        ]

        const groups = groupByRecency(items, (item) => item.date, now)

        expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
            ['Today', ['a']],
            ['Yesterday', ['b']],
            ['This week', ['c']],
            ['This month', ['d']],
            ['Earlier', ['e', 'f']],
        ])
    })

    it('omits empty buckets', () => {
        const groups = groupByRecency([{date: at(5, 23)}], (item) => item.date, now)

        expect(groups.map((group) => group.label)).toEqual(['Yesterday'])
    })
})
