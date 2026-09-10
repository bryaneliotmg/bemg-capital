import { chromium as playwrightChromium } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface RenderedPage {
  status: number;
  bodyText: string;
  /** Every (visible link text, href) pair on the page, in DOM order — innerText alone
   * drops hrefs, and the extraction prompt needs them to attach a real "apply" URL to
   * each listing rather than just pointing everything at the general listing page. */
  links: { text: string; href: string }[];
}

/**
 * Renders a page with a real headless browser instead of a plain fetch() — some
 * sites (e.g. MBDA.gov, and Hello Alice before its real UA was set) return a bot
 * challenge or a 403 to a raw HTTP request that a rendered browser gets past.
 * Not guaranteed against every anti-bot vendor (see api/cron/sync-hello-alice.ts
 * comment) — this is the level of effort that's actually worth it for a source
 * that's confirmed to work, not an arms race against every possible defense.
 *
 * Uses @sparticuz/chromium's bundled binary on Vercel (where no system Chromium
 * exists) and whatever Chromium `playwright install` set up locally otherwise.
 */
export async function fetchRenderedPage(url: string, waitMs = 2000): Promise<RenderedPage> {
  const onVercel = !!process.env.VERCEL;
  const browser = await playwrightChromium.launch(
    onVercel
      ? { args: sparticuzChromium.args, executablePath: await sparticuzChromium.executablePath(), headless: true }
      : { headless: true },
  );

  try {
    const context = await browser.newContext({ userAgent: DESKTOP_UA });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(waitMs);
    const bodyText = await page.locator('body').innerText();
    const links = await page.locator('a').evaluateAll((els) =>
      els
        .map((el) => ({ text: (el.textContent ?? '').trim(), href: el.getAttribute('href') ?? '' }))
        .filter((l) => l.text && l.href),
    );
    return { status: response?.status() ?? 0, bodyText, links };
  } finally {
    await browser.close();
  }
}
