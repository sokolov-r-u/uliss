import type {ReactNode} from 'react'
import {createMemoryRouter, RouterProvider} from 'react-router-dom'

/**
 * [element] under an in-memory data router, as the app runs (`useBlocker` needs one). Its own `<Routes>` match the
 * whole path, as in `main.tsx`; [router] drives navigation (`router.navigate(-1)` is the browser's Back).
 */
export function dataRouter(element: ReactNode, initialEntries: string[] = ['/']) {
    const router = createMemoryRouter([{path: '*', element}], {initialEntries})
    return {router, ui: <RouterProvider router={router}/>}
}
