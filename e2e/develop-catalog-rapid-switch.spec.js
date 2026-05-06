import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const _root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePng = path.join(_root, 'tests/fixtures/e2e-two-tone.png');
const fixtureCopy = path.join(_root, 'tests/fixtures/e2e-two-tone-copy.png');

test.describe('Film Lab — Develop z katalogu', () => {
  test('szybkie przełączanie dwóch assetów na filmstripie nie psuje podglądu', async ({ page }) => {
    /** Lazy `FilmLab` + ciężki graf modułów — w CI potrafi przekroczyć 120 s bez jawnego waita na shell. */
    test.setTimeout(180_000);

    await page.goto('/film-lab?workspace=library', { waitUntil: 'load' });
    await page.waitForLoadState('domcontentloaded');

    /**
     * `film-lab-source-file-input` jest w `FilmLabShell` dopiero po załadowaniu chunka i mountcie.
     * Czekamy na stabilny marker UI (nav), żeby uniknąć „wiszenia” na ukrytym inpucie przy błędzie bundla / Suspense.
     */
    await expect(page.locator('.film-lab-studio-nav-inner')).toBeVisible({ timeout: 120_000 });

    const fileInput = page.getByTestId('film-lab-source-file-input');
    await expect(fileInput).toBeAttached({ timeout: 60_000 });
    await fileInput.setInputFiles([fixturePng, fixtureCopy], { timeout: 60_000 });

    /**
     * Warstwa Biblioteki musi być aktywna (`is-route-active`); inaczej ma `visibility:hidden`
     * i asercje Playwright na potomkach mogą zwracać „element(s) not found”.
     *
     * W CI po imporcie część przebiegów zostaje na Develop — `toBeVisible` na `.is-route-active`
     * wtedy trafia w 0 elementów. Poll + klik w pierwszą zakładkę (Biblioteka) stabilizuje route.
     */
    await expect(page.locator('.film-lab-route-layer--library')).toBeAttached({ timeout: 60_000 });
    await expect
      .poll(
        async () => {
          const active = await page.evaluate(() => {
            const el = document.querySelector('.film-lab-route-layer--library');
            return Boolean(el?.classList.contains('is-route-active'));
          });
          if (active) return true;
          await page.locator('.film-lab-studio-nav-inner button').nth(0).click();
          return false;
        },
        { timeout: 120_000, intervals: [200, 400, 800, 1600] }
      )
      .toBe(true);

    /**
     * `toHaveAttribute` na locatorze czeka na widoczny element — ukryta warstwa route psuje CI.
     * Poll + `document.querySelector` czyta `data-asset-count` z DOM i daje czas na ingest OPFS/katalog.
     */
    const libraryListboxSel = '.film-lab-library-filmstrip-host [role="listbox"]';
    await expect
      .poll(
        async () =>
          page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.getAttribute('data-asset-count') ?? null;
          }, libraryListboxSel),
        { timeout: 120_000, intervals: [200, 400, 800, 1600] }
      )
      .toBe('2');

    /** Sloty z `data-asset-id` — potwierdzenie jak „Option 2”; virtual list może ustawić komórki nieco później niż atrybut. */
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              document.querySelectorAll(
                '.film-lab-library-filmstrip-host .film-lab-filmstrip-cell[data-asset-id]'
              ).length
          ),
        { timeout: 120_000, intervals: [200, 400, 800, 1600] }
      )
      .toBe(2);

    /** Ta sama sesja SPA — `goto` zrywał timing ładowania katalogu z OPFS w części środowisk. */
    await page.locator('.film-lab-studio-nav-inner button').nth(1).click();
    await expect(page.locator('.film-lab-route-layer--develop.is-route-active')).toBeVisible({
      timeout: 15_000,
    });

    /** Na Develop filmstrip jest w dolnym slocie globalnym (nie w gridzie biblioteki). */
    const devListboxSel = '.film-lab-global-filmstrip-slot [role="listbox"]';
    await expect
      .poll(
        async () =>
          page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.getAttribute('data-asset-count') ?? null;
          }, devListboxSel),
        { timeout: 90_000, intervals: [200, 400, 800] }
      )
      .toBe('2');

    const cells = page.locator('.film-lab-global-filmstrip-slot .film-lab-filmstrip-cell[data-asset-id]');
    await expect(cells).toHaveCount(2);
    await cells.nth(0).click();

    const canvasHost = page.locator('[data-testid="film-lab-canvas-wrapper"]');
    await expect(canvasHost).toBeVisible({ timeout: 90_000 });

    for (let r = 0; r < 8; r += 1) {
      await cells.nth(r % 2).click();
      await expect(canvasHost).toBeVisible();
    }

    /** W wrapperze są dodatkowe canvasy (preview chipy); główny podgląd to bezpośredni child. */
    await expect(canvasHost.locator(':scope > canvas')).toBeVisible();
  });
});
