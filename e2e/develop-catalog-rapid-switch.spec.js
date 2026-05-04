import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const _root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePng = path.join(_root, 'tests/fixtures/e2e-two-tone.png');
const fixtureCopy = path.join(_root, 'tests/fixtures/e2e-two-tone-copy.png');

test.describe('Film Lab — Develop z katalogu', () => {
  test('szybkie przełączanie dwóch assetów na filmstripie nie psuje podglądu', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/film-lab?workspace=library');

    await page.locator('[data-testid="film-lab-source-file-input"]').setInputFiles([fixturePng, fixtureCopy]);

    const filmstrip = page.locator('.film-lab-library-filmstrip-host [role="listbox"]').first();
    await expect(filmstrip).toHaveAttribute('data-asset-count', '2', { timeout: 90_000 });

    /** Ta sama sesja SPA — `goto` zrywał timing ładowania katalogu z OPFS w części środowisk. */
    await page.locator('.film-lab-studio-nav-inner button').nth(1).click();
    await expect(page.locator('.film-lab-route-layer--develop.is-route-active')).toBeVisible({
      timeout: 15_000,
    });

    /** Na Develop filmstrip jest w dolnym slocie globalnym (nie w gridzie biblioteki). */
    const filmstripDev = page.locator('.film-lab-global-filmstrip-slot [role="listbox"]').first();
    await expect(filmstripDev).toHaveAttribute('data-asset-count', '2', { timeout: 90_000 });

    const cells = filmstripDev.locator('.film-lab-filmstrip-cell[data-asset-id]');
    await expect(cells).toHaveCount(2);
    await cells.nth(0).click();

    const canvasHost = page.locator('[data-testid="film-lab-canvas-wrapper"]');
    await expect(canvasHost).toBeVisible({ timeout: 90_000 });

    for (let r = 0; r < 8; r += 1) {
      await cells.nth(r % 2).click();
      await expect(canvasHost).toBeVisible();
    }

    /** W wrapperze są m.in. chip Smart Preview (`aria-hidden`) i główny canvas podglądu. */
    await expect(canvasHost.locator('canvas:not([aria-hidden="true"])')).toBeVisible();
  });
});
