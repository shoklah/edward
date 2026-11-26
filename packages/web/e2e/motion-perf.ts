// What motion costs, run by hand (`pnpm --filter @cwd/web perf:motion`, on AC power, nothing else running): the built app
// on invented data in installed Chrome, headed on the main display, which must be a 120 Hz one, light and dark, at full
// speed and with the CPU slowed 4 times. Prints one table; exits 0 when every moment passes, else 1. `--no-filters` hides
// what tells Chromium, so the page's copy is cut by a `clip-path` as it is elsewhere.
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { hold, landImport } from './motion.ts';

/** A frame at 120 Hz. */
const FRAME = 1000 / 120;
const LINK = (path: string) => `aside nav a[href="${path}"]`;
const CLOSED = '#main tbody button[aria-expanded="false"]';
const OPEN = '#main tbody button[aria-expanded="true"]';

/** Presses the first of each of `presses`, 150 ms apart, and returns the gaps between the frames of `ms`; throws when
 * nothing ever matched `proof`, so a press that does nothing isn't measured. */
async function measure(page: Page, ms: number, proof: string, presses: string[] = []): Promise<number[]> {
  const { gaps, seen } = await page.evaluate(
    async ([ms, proof, presses]) => {
      const times = [await new Promise(requestAnimationFrame)];
      for (const [i, press] of presses.entries()) setTimeout(() => document.querySelector<HTMLElement>(press)!.click(), i * 150);
      let seen = false;
      while (times.at(-1)! - times[0] < ms) {
        times.push(await new Promise(requestAnimationFrame));
        seen ||= document.querySelector(proof) !== null;
      }
      return { gaps: times.slice(1).map((time, i) => time - times[i]), seen };
    },
    [ms, proof, presses] as const,
  );
  if (!seen) throw new Error(`nothing matched ${proof} after ${presses.join(', ') || 'an import'}`);
  return gaps;
}

/** Until nothing is in flight: a load's unseen preparing, or a wave. */
async function rested(page: Page): Promise<void> {
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => !document.querySelector('[data-copy], canvas') && document.getAnimations().every((a) => a.id === ''));
}

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle' });
  await rested(page);
}

/** Each moment's samples: a sample is the gaps between its frames. */
const MOMENTS: Record<string, (page: Page) => Promise<number[][]>> = {
  'page switch': async (page) => {
    const samples: number[][] = [];
    await load(page, '/');
    for (let i = 1; i <= 17; i++) {
      samples.push(await measure(page, 1700, '[data-copy="page"]', [LINK(['/', '/weeks', '/work', '/steps'][i % 4])]));
      await rested(page);
    }
    // The first switch after the load is left out.
    return samples.slice(1);
  },
  'opening a run': async (page) => {
    const samples: number[][] = [];
    await load(page, '/work?view=runs');
    const runs = await page.locator('#main a[href^="/runs/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    for (let i = 0; i <= 8; i++) {
      samples.push(await measure(page, 2600, `[aria-label="The run's flow"]`, [`#main a[href="${runs[i % runs.length]}"]`]));
      await rested(page);
      await page.goBack();
      await page.locator(CLOSED).first().waitFor();
      await rested(page);
    }
    return samples.slice(1);
  },
  'an import': async (page) => {
    const samples: number[][] = [];
    for (const path of ['/', '/weeks', '/', '/weeks']) {
      await load(page, path);
      const { held, release } = hold();
      // Refresh is pressed here, before the frames are counted, and answered once they are.
      await landImport(page, { '/api/home': another, '/api/weeks': another }, held);
      const sample = measure(page, 5500, '[data-drop]');
      release();
      samples.push(await sample);
      await page.unrouteAll();
    }
    return samples;
  },
  'six rows opened': async (page) => {
    const samples: number[][] = [];
    await load(page, '/work?view=runs');
    for (let i = 0; i < 4; i++) {
      samples.push(await measure(page, 1500, OPEN, Array(6).fill(CLOSED)));
      await page.locator(OPEN).evaluateAll((rows) => rows.forEach((row) => (row as HTMLElement).click()));
      await rested(page);
    }
    return samples;
  },
};

/** One more of every number of a response. */
function another(body: any): void {
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'number') body[key] = value + 1;
    else if (value && typeof value === 'object') another(value);
  }
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
}

async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  return port;
}

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
execFileSync('pnpm', ['build'], { cwd: at('..'), stdio: 'inherit' });

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['src/dev-fixtures.ts'], {
  cwd: at('../../server'),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
process.on('exit', () => server.kill());
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => process.exit(1));
while (!(await fetch(`${origin}/api/status`).then((response) => response.ok, () => false))) {
  if (server.exitCode !== null) throw new Error('dev:fixtures did not start');
  await new Promise((done) => setTimeout(done, 200));
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=0,0'] });
const rows: Record<string, string | number | boolean>[] = [];
for (const speed of [1, 4]) {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1728, height: 903 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const idle = median(await measure(page, 1000, 'html'));
    if (Math.abs(idle - FRAME) > 0.5) throw new Error(`the main display's frames are ${idle.toFixed(1)} ms, not 120 Hz`);
    if (process.argv.includes('--no-filters')) {
      await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { value: undefined }));
    }
    await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: speed });
    for (const [moment, samplesOf] of Object.entries(MOMENTS)) {
      const samples = await samplesOf(page);
      const missed = samples.map((gaps) => gaps.reduce((sum, gap) => sum + Math.max(0, Math.round(gap / FRAME) - 1), 0));
      const gaps = samples.flat();
      const over = gaps.filter((gap) => gap > 20).length;
      const longest = Math.max(...gaps);
      rows.push({
        CPU: speed === 1 ? 'full speed' : 'slowed 4×',
        theme,
        moment,
        times: samples.length,
        'missed (median)': median(missed),
        'missed (worst)': Math.max(...missed),
        'over 20 ms': over,
        'longest (ms)': Number(longest.toFixed(1)),
        passes: speed === 1 ? over === 0 : median(missed) <= 6 && longest <= 60,
      });
    }
    await context.close();
  }
}
console.table(rows);
await browser.close();
process.exit(rows.every((row) => row.passes) ? 0 : 1);
