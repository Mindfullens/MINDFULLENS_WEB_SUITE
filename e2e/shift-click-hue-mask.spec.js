import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const _root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePng = path.join(_root, 'tests/fixtures/e2e-two-tone.png');

async function readHueCenter(page) {
  const slider = page.locator('#colorMaskHueCenterSlider');
  await expect(slider).toBeVisible({ timeout: 15_000 });
  const v = await slider.inputValue();
  return Number(v);
}

test.describe('Film Lab — maska Hue (Shift+klik)', () => {
  test('Shift+klik ustawia Hue center z piksela podglądu', async ({ page }) => {
    await page.goto('/film-lab?workspace=develop');

    await page.locator('[data-testid="film-lab-source-file-input"]').setInputFiles(fixturePng);

    const canvasHost = page.locator('[data-testid="film-lab-canvas-wrapper"]');
    await expect(canvasHost).toBeVisible({ timeout: 30_000 });
    const canvas = canvasHost.locator('canvas:not(.brush-mask-rubylith)');
    await expect(canvas).toBeVisible();

    await page.getByTestId('film-lab-mask-picker-manual-brush').click();
    await expect(page.locator('.mask-layer-card')).toHaveCount(1, { timeout: 15_000 });

    await page
      .locator('summary.mask-studio-range-summary')
      .filter({ hasText: /Filtr zakresu|Range filters/i })
      .click();
    await expect(page.getByTestId('film-lab-mask-mode-color')).toBeVisible();
    await page.getByTestId('film-lab-mask-mode-color').click();

    const before = await readHueCenter(page);

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const y = box.height * 0.5;
    const xRed = box.width * 0.25;
    const xGreen = box.width * 0.75;

    await canvas.click({
      position: { x: xRed, y },
      modifiers: ['Shift'],
    });

    await expect
      .poll(async () => readHueCenter(page), { timeout: 10_000 })
      .not.toBe(before);

    const afterRed = await readHueCenter(page);
    expect(Math.abs(afterRed - 0)).toBeLessThanOrEqual(4);

    await canvas.click({
      position: { x: xGreen, y },
      modifiers: ['Shift'],
    });

    await expect
      .poll(async () => readHueCenter(page), { timeout: 10_000 })
      .toBeGreaterThan(90);

    const afterGreen = await readHueCenter(page);
    expect(afterGreen).toBeGreaterThan(110);
    expect(afterGreen).toBeLessThan(130);
  });
});
