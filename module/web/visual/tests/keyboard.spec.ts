import {expect, test} from '@playwright/test'

test('disabled onboarding primary cannot activate and native field accepts input', async ({page}) => {
    await page.goto('/visual/index.html?scenario=onboarding-name')
    const input = page.getByRole('textbox', {name: 'Display name'})
    const primary = page.getByRole('button', {name: 'Continue'})
    await expect(primary).toBeDisabled()
    await input.fill('Wayfarer')
    await expect(primary).toBeEnabled()
    await input.press('Tab')
    await expect(primary).toBeFocused()
})

test('listbox supports arrows, Enter, Escape and focus restoration', async ({page}) => {
    await page.goto('/visual/index.html?scenario=sky-populated')
    const trigger = page.getByRole('button', {name: 'Filter by constellation'})
    await trigger.focus()
    await trigger.press('ArrowDown')
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeFocused()
    await listbox.press('ArrowDown')
    await listbox.press('Enter')
    await expect(trigger).toBeFocused()
    await trigger.press('Enter')
    await listbox.press('Escape')
    await expect(trigger).toBeFocused()
})

test('a disabled controlled select suppresses its open listbox', async ({page}) => {
    await page.goto('/visual/index.html?scenario=select-disabled-open')
    const trigger = page.getByRole('button', {name: 'Disabled controlled select'})
    await expect(trigger).toBeDisabled()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('dialog traps focus, closes on Escape and skips disabled controls', async ({page}) => {
    await page.goto('/visual/index.html?scenario=dialog')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const cancel = page.getByRole('button', {name: 'Keep'})
    const confirm = page.getByRole('button', {name: 'Delete'})
    await expect(cancel).toBeFocused()
    await cancel.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    await confirm.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', {name: 'Return focus'})).toBeFocused()
})

test('radio controls expose checked and disabled state', async ({page}) => {
    await page.goto('/visual/index.html?scenario=settings-sky')
    const labels = page.getByRole('radiogroup', {name: 'Labels'})
    await expect(labels.getByRole('radio')).toHaveCount(3)
    await expect(labels.getByRole('radio', {name: 'Auto'})).toBeChecked()
    await expect(labels.getByRole('radio', {name: 'Auto'})).toBeDisabled()
})
