import { expect, test, chromium } from '@playwright/test';
import path from 'node:path';

test('renders the options page controls', async () => {
  test.skip(
    !process.env.CI && process.platform === 'linux' && !process.env.DISPLAY,
    'Chromium extension tests need a display server in local Linux environments.',
  );

  const extensionPath = path.join(process.cwd(), '.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await expect(page.getByRole('heading', { name: 'Mute Similar X Images' })).toBeVisible();
    await expect(page.getByLabel('Gemini API key')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
  } finally {
    await context.close();
  }
});
