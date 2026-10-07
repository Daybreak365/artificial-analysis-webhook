import { chromium } from 'playwright';
import fs from 'node:fs';

const PAGE_URL = 'https://artificialanalysis.ai/#intelligence';
const OUTPUT = 'intelligence-index.png';

// User-provided XPath for the Artificial Analysis "Download Image" button.
const DOWNLOAD_BUTTON_XPATH = '/html/body/main/div[2]/div[2]/div/div/section[1]/div[2]/div[1]/div[1]/div[1]/div[2]/div[1]/button[2]';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1600, height: 1200 },
});
const page = await context.newPage();

async function acceptCookiesIfPresent() {
  const patterns = [
    /accept all/i,
    /accept cookies/i,
    /^accept$/i,
    /allow all/i,
    /^agree$/i,
  ];

  for (const pattern of patterns) {
    const button = page.getByRole('button', { name: pattern }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(700);
      break;
    }
  }
}

async function getDownloadButton() {
  // 1) Exact XPath supplied by the user.
  const exact = page.locator(`xpath=${DOWNLOAD_BUTTON_XPATH}`);
  if (await exact.isVisible().catch(() => false)) {
    console.log('Found Download Image button using the supplied XPath.');
    return exact;
  }

  // 2) Fallback in case the page layout changes slightly later.
  const fallback = page.getByRole('button', {
    name: /download.*image|download|save.*image|export.*image/i,
  }).first();

  if (await fallback.isVisible().catch(() => false)) {
    console.log('Exact XPath did not match; using accessible-name fallback.');
    return fallback;
  }

  throw new Error('Could not find the Download Image button.');
}

try {
  console.log(`Opening ${PAGE_URL}`);

  await page.goto(PAGE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await acceptCookiesIfPresent();

  // Allow the chart and controls to finish rendering.
  await page.waitForTimeout(3000);

  const button = await getDownloadButton();
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  console.log('Clicking Download Image...');

  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await button.click();
  const download = await downloadPromise;

  console.log(`Browser download filename: ${download.suggestedFilename()}`);
  await download.saveAs(OUTPUT);

  const stats = fs.statSync(OUTPUT);
  if (stats.size < 1000) {
    throw new Error(`Downloaded file is suspiciously small: ${stats.size} bytes`);
  }

  console.log(`Saved ${OUTPUT} (${Math.round(stats.size / 1024)} KB)`);
} catch (error) {
  console.error(error);

  await page.screenshot({
    path: 'debug-page.png',
    fullPage: true,
  }).catch(() => {});

  process.exitCode = 1;
} finally {
  await browser.close();
}
