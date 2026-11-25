import { useQueryClient } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within, type Mock } from 'storybook/test';
import type { HomeResponse, StatusResponse } from '@cwd/shared';
import { useLiveQuery } from '../api.ts';
import { emptyHome, fullHome } from '../test/home.ts';
import { viewingStatus } from '../test/account.ts';
import { mockApi } from '../test/mock-api.ts';
import { eachFrame, finish, fits, motionOn, played } from '../test/motion.ts';
import { Feed } from './Feed.tsx';

const meta = { component: Feed } satisfies Meta<typeof Feed>;
export default meta;
type Story = StoryObj<typeof meta>;

const LAST_GOOD = '2026-11-12T10:00:00.000Z';
const ok: StatusResponse = { lastImportAt: LAST_GOOD, lastGoodImportAt: LAST_GOOD, error: null, importing: false };

const EMPTY = 'Nothing new. Finished runs and new warnings show here until you mark them seen.';

/** An item's facts as [term, value] pairs. */
const facts = (item: HTMLElement) =>
  within(item)
    .queryAllByRole('term')
    .map((term) => [term.textContent, term.nextElementSibling?.textContent]);

/** Empty: nothing new since the last look, so nothing to mark seen. */
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Since you last looked' })).toHaveClass('glass');
    await expect(canvas.getByText(EMPTY)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Mark all seen' })).toBeNull();
  },
};

/** Full: finished runs and new warnings, newest first, each led by its message; free text shows as text, never as HTML. */
export const Full: Story = {
  args: { items: fullHome.feed },
  // In Home's column from lg (`lg:w-72`), where the title's row is tightest.
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const items = within(canvas.getByRole('list')).getAllByRole('listitem');
    await expect(items).toHaveLength(4);

    // A finished run: its title opening the run, its project and path, then its facts as labelled pairs.
    await expect(items[0]).toHaveTextContent('Run finished');
    await expect(within(items[0]).getByRole('link', { name: 'Search every note by title and body' })).toHaveAttribute('href', '/runs/a1b2c3d4e5f60718');
    await expect(within(items[0]).getByText('atlas, Full path')).toBeVisible();
    await expect(facts(items[0])).toEqual([
      ['Findings', '6'],
      ['Acted on', '5'],
      ['Open', '0'],
      ['Time', '2 h 10'],
      ['All models', '1.1%'],
    ]);
    await expect(items[0].querySelector('time')).toHaveAttribute('datetime', '2026-11-12T10:40:00.000Z');
    await expect(items[0].querySelector('.bg-success-edge')).not.toBeNull();

    // A session's warning: no run to open, its session trailing on its own line.
    await expect(items[1]).toHaveTextContent('New warning');
    await expect(within(items[1]).queryByRole('link')).toBeNull();
    await expect(within(items[1]).getByRole('button', { name: 'Copy session ID' })).toBeVisible();
    await expect(items[1]).toHaveTextContent('Typed "grill me" but grill-me never loaded');
    await expect(items[1].querySelector('.bg-warning-edge')).not.toBeNull();

    // A run's warning opens its run; the run's own "branch (date):" lead is gone, the run's link already names it.
    await expect(within(items[2]).getByRole('link', { name: 'Search every note by title and body' })).toHaveAttribute('href', '/runs/a1b2c3d4e5f60718');
    await expect(within(items[2]).getByText('final-reviewer ran on another model than its pin')).toBeVisible();
    await expect(facts(items[2])).toEqual([]);

    await expect(within(items[3]).getByRole('link', { name: '<img src=x onerror=alert(1)>' })).toHaveAttribute(
      'href',
      '/runs/0f1e2d3c4b5a6978',
    );
    await expect(within(items[3]).getByText('harbor, Small path')).toBeVisible();
    await expect(facts(items[3])).toEqual([
      ['Findings', '1'],
      ['Acted on', '1'],
      ['Open', '0'],
      ['Time', '25 min'],
      ['All models', '–not known'],
    ]);
    await expect(canvasElement.querySelector('img')).toBeNull();

    // The status is a swatch beside its word, not a coloured edge; nothing is joined with " · ".
    await expect(canvasElement.querySelector('.border-l-4, .border-l-3')).toBeNull();
    await expect(canvasElement.textContent).not.toContain(' · ');

    // Reading order: docs/design/2026-11-18-feed-items.
    const font = (el: Element) => {
      const style = getComputedStyle(el);
      return [style.fontSize, style.fontWeight, style.color];
    };
    const inOrder = (...els: Element[]) =>
      els.every((el, i) => i === 0 || els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    const [finished, sessionWarning, runWarning] = items.slice(0, 3).map((item) => within(item));
    const warning = runWarning.getByText('final-reviewer ran on another model than its pin');
    const warningStatus = runWarning.getByText('New warning');
    const warningRun = runWarning.getByRole('link');
    const warningProject = runWarning.getByText('atlas');
    const title = finished.getByRole('link', { name: 'Search every note by title and body' });
    const runStatus = finished.getByText('Run finished');
    const runProject = finished.getByText('atlas, Full path');
    const [findings, actedOn] = finished.getAllByRole('term');
    const session = sessionWarning.getByText('Session', { exact: false });
    // The caption and context in secondary ink, the message in primary.
    const [muted, primary] = [getComputedStyle(warningStatus).color, getComputedStyle(warning).color];
    await expect(muted).not.toBe(primary);
    for (const small of [warningStatus, warningRun, warningProject, session, runStatus, runProject, findings]) {
      await expect(font(small)).toEqual(['12px', '400', muted]);
    }
    for (const message of [warning, sessionWarning.getByText('Typed "grill me" but grill-me never loaded'), title]) {
      await expect(font(message)).toEqual(['14px', '500', primary]);
    }
    await expect(inOrder(warningStatus, warning, warningRun, warningProject)).toBe(true);
    await expect(inOrder(runStatus, title, runProject)).toBe(true);
    // A run's facts share one row.
    await expect(findings.getBoundingClientRect().top).toBe(actedOn.getBoundingClientRect().top);

    // "Mark all seen" is an icon on the title's row at the column's 288 px, named and with its tooltip.
    const middle = (el: Element) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
    const mark = canvas.getByRole('button', { name: 'Mark all seen' });
    await expect(mark.textContent).toBe('');
    await expect(Math.abs(middle(mark) - middle(canvas.getByRole('heading', { name: 'Since you last looked' })))).toBeLessThan(2);
    await userEvent.hover(mark);
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent('Mark all seen');

    // The list scrolls in its own focusable region, named apart from the panel's.
    await expect(canvas.getByRole('region', { name: 'Since you last looked list' })).toHaveAttribute('tabindex', '0');
  },
};

// 30 items, a minute apart, cycling through the four of Full.
const many = Array.from({ length: 30 }, (_, i) => ({
  ...fullHome.feed[i % 4],
  at: `2026-11-12T10:${String(59 - i).padStart(2, '0')}:00.000Z`,
}));

/** Many: stacked under the page, the list scrolls in its own region at most 24 rem tall, with the tables' edge cue. */
export const Many: Story = {
  args: { items: many },
  parameters: { viewport: { options: { phone: { name: 'Phone', styles: { width: '375px', height: '812px' } } } } },
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    const list = canvas.getByRole('region', { name: 'Since you last looked list' });
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    await expect(list.getBoundingClientRect().height).toBeLessThanOrEqual(24 * 16);
    // The cue follows the list's scroll, down the list (the gradient's default direction, so none is written): its foot
    // fades at the top, both ends once scrolled, its head alone at the end.
    const mask = () => getComputedStyle(list).maskImage;
    const [clear, ink] = ['rgba(0, 0, 0, 0)', 'rgb(0, 0, 0)'];
    await waitFor(() => expect(mask()).toBe(`linear-gradient(${ink} calc(100% - 48px), ${clear})`));
    list.scrollTop = (list.scrollHeight - list.clientHeight) / 2;
    await waitFor(() => expect(mask()).toBe(`linear-gradient(${clear}, ${ink} 48px, ${ink} calc(100% - 48px), ${clear})`));
    list.scrollTop = list.scrollHeight;
    await waitFor(() => expect(mask()).toBe(`linear-gradient(${clear}, ${ink} 48px)`));
  },
};

/** A warning as the log writes it: its "WARN:" prefix never shows. */
export const LogPrefix: Story = {
  args: { items: [{ ...fullHome.feed[2], text: 'WARN: feat/search (2026-11-12): final-reviewer ran on another model than its pin' }] },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('final-reviewer ran on another model than its pin')).toBeVisible();
    await expect(canvasElement.textContent).not.toContain('WARN:');
  },
};

/** A finished run whose usage, time and findings aren't known: each a dash read out as not known, never 0. */
export const Unknowns: Story = {
  args: { items: [{ ...fullHome.feed[0], findings: null, minutes: null, allPct: null }] },
  play: async ({ canvas }) => {
    await expect(facts(canvas.getByRole('listitem'))).toEqual([
      ['Findings', '–not known'],
      ['Acted on', '–not known'],
      ['Open', '–not known'],
      ['Time', '–not known'],
      ['All models', '–not known'],
    ]);
  },
};

// The server's answers for MarkAllSeen; the home answer turns empty once the POST lands, as the server's would.
const routes: Record<string, object | number> = {};

/** The requests of `path`. */
const asked = (path: string) => (fetch as unknown as Mock<typeof fetch>).mock.calls.filter(([asked]) => asked === path);

/** Holds the home answers until told. */
function holdHome(): () => void {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const answers = fetch as unknown as Mock<typeof fetch>;
  const answer = answers.getMockImplementation()!;
  answers.mockImplementation(async (path) => {
    const response = await answer(path);
    if (path === '/api/home') await held;
    return response;
  });
  return release;
}

/** Marking all seen posts once, then the home data is read again and the feed empties, its items washing away. */
export const MarkAllSeen: Story = {
  args: { items: fullHome.feed },
  beforeEach: () => {
    Object.assign(routes, { '/api/status': ok, '/api/home': fullHome, '/api/seen': 204 });
    mockApi(routes);
    const on = motionOn();
    return () => on.mockRestore();
  },
  // The page's way of feeding the list: the live home query.
  render: function Render() {
    const home = useLiveQuery<HomeResponse>('/api/home');
    return <Feed items={home.data?.feed ?? []} />;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const items = await canvas.findAllByRole('listitem');
    await expect(items).toHaveLength(4);
    const places = items.map((item) => item.getBoundingClientRect().toJSON());
    const font = getComputedStyle(items[0]).font;
    routes['/api/home'] = emptyHome;
    const release = holdHome();

    const mark = canvas.getByRole('button', { name: 'Mark all seen' });
    // Every button is a pill (DESIGN.md), through index.css's one rule.
    await expect(getComputedStyle(mark).borderTopLeftRadius).toBe('9999px');
    await userEvent.click(mark);
    await waitFor(() => expect(asked('/api/home')).toHaveLength(2));
    await expect(asked('/api/seen')).toEqual([['/api/seen', { method: 'POST', headers: { 'X-Dashboard-Refresh': '1' } }]]);
    await expect(canvas.getAllByRole('listitem')).toEqual(items);
    await expect(document.querySelector('[data-copy]')).toBeNull();

    release();
    // Read in one go, since it lasts a moment.
    const { copies, ...leaving } = await waitFor(() => {
      const layer = document.querySelector('[data-copy="items"]')!;
      expect(layer).not.toBeNull();
      const line = canvas.getByText(EMPTY);
      for (const animation of [...layer.getAnimations({ subtree: true }), ...line.getAnimations()]) animation.currentTime = 0;
      return {
        copies: [...layer.children].map((el) => ({ place: el.getBoundingClientRect().toJSON(), font: getComputedStyle(el).font })),
        washed: played(layer),
        condensed: played(line),
        delay: line.getAnimations()[0].effect!.getTiming().delay,
        listed: canvasElement.querySelectorAll('li').length,
      };
    });
    await expect(copies).toEqual(places.map((place) => ({ place, font })));
    await expect(leaving.washed.map(({ verb, ms }) => [verb, ms])).toEqual(items.map(() => ['wash', 260]));
    await expect(leaving.condensed).toEqual([{ verb: 'condense', ms: 420, el: canvas.getByText(EMPTY) }]);
    await expect(leaving.listed).toBe(0);
    // The last item's wash, then the line.
    await expect(leaving.delay).toBe(260 + 3 * 34);
    const early: string[] = [];
    while (document.querySelector('[data-copy]')) {
      early.push(getComputedStyle(canvas.getByText(EMPTY)).opacity);
      await new Promise(requestAnimationFrame);
    }
    await expect(early.filter((opacity) => opacity !== '0')).toEqual([]);
    await waitFor(() => expect(getComputedStyle(canvas.getByText(EMPTY)).opacity).toBe('1'));
  },
};

/** An import's item lands as a drop, also the first of an empty feed, and a tall one never scrolls a feed that fits. */
export const Lands: Story = {
  args: { items: fullHome.feed },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    Object.assign(routes, { '/api/status': ok, '/api/home': fullHome });
    mockApi(routes);
    const on = motionOn();
    return () => on.mockRestore();
  },
  render: function Render() {
    const queryClient = useQueryClient();
    const home = useLiveQuery<HomeResponse>('/api/home');
    return (
      <>
        <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['status'] })}>
          Import
        </button>
        <Feed items={home.data?.feed ?? []} />
      </>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findAllByRole('listitem')).toHaveLength(4);
    await expect(played(canvasElement)).toEqual([]);
    let hour = 10;
    const land = async (feed: HomeResponse['feed']) => {
      hour += 1;
      routes['/api/status'] = { ...ok, lastGoodImportAt: `2026-11-12T${hour}:00:00.000Z` };
      routes['/api/home'] = { ...fullHome, feed };
      await userEvent.click(canvas.getByRole('button', { name: 'Import' }));
    };
    const landing = { ...fullHome.feed[2], text: 'Simplify never ran' };
    const ripples = () => played(canvas.getByRole('list')).filter(({ verb }) => verb === 'ripple');
    /** The item that shows `text`, landing: in the document, unseen until the front is there. */
    const landed = async (text: string) => {
      const item = (await canvas.findByText(text)).closest('li')!;
      await waitFor(() => expect(ripples()).toEqual([{ verb: 'ripple', ms: 680, el: item }]));
      return item;
    };

    const rest = canvas.getAllByRole('listitem');
    await land([landing, ...fullHome.feed]);
    const item = await landed(landing.text);
    await expect(getComputedStyle(item).opacity).toBe('0');
    await expect(played(canvas.getByRole('list')).filter(({ verb }) => verb === 'flow')).toEqual(rest.map((el) => ({ verb: 'flow', ms: 560, el })));
    finish(canvasElement);

    await land([]);
    await expect(await canvas.findByText(EMPTY)).toBeVisible();
    const tall = { ...landing, text: Array(24).fill(landing.text).join(', ') };
    await land([tall]);
    const first = await landed(tall.text);
    const region = canvas.getByRole('region', { name: 'Since you last looked list' });
    await eachFrame(canvasElement, () => fits(region));
    await expect(first.getBoundingClientRect().height).toBeGreaterThan(170);
  },
};

/** Marked seen, with the home data not read again: what leaves the feed later is no answer to that press. */
export const SeenNotReadAgain: Story = {
  args: { items: fullHome.feed },
  beforeEach: () => {
    Object.assign(routes, { '/api/status': ok, '/api/home': fullHome, '/api/seen': 204 });
    mockApi(routes);
    const on = motionOn();
    return () => on.mockRestore();
  },
  render: Lands.render,
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findAllByRole('listitem')).toHaveLength(4);
    routes['/api/home'] = 500;
    await userEvent.click(canvas.getByRole('button', { name: 'Mark all seen' }));
    await waitFor(() => expect(asked('/api/home')).toHaveLength(2));
    await new Promise((done) => setTimeout(done, 100));
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4);

    Object.assign(routes, { '/api/status': { ...ok, lastGoodImportAt: '2026-11-12T11:00:00.000Z' }, '/api/home': emptyHome });
    await userEvent.click(canvas.getByRole('button', { name: 'Import' }));
    const moving = await waitFor(() => [...played(canvas.getByText(EMPTY)), ...document.querySelectorAll('[data-copy]')]);
    await expect(moving).toEqual([]);
  },
};

/** Marked seen as an import lands in the same answer: the seen items wash away and the import's item lands. */
export const SeenAsAnImportLands: Story = {
  args: { items: fullHome.feed },
  beforeEach: SeenNotReadAgain.beforeEach,
  render: Lands.render,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findAllByRole('listitem')).toHaveLength(4);
    const landing = { ...fullHome.feed[2], text: 'Simplify never ran' };
    Object.assign(routes, { '/api/status': { ...ok, lastGoodImportAt: '2026-11-12T12:00:00.000Z' }, '/api/home': { ...fullHome, feed: [landing] } });
    const release = holdHome();
    await userEvent.click(canvas.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(asked('/api/home')).toHaveLength(2));
    await userEvent.click(canvas.getByRole('button', { name: 'Mark all seen' }));
    await waitFor(() => expect(asked('/api/seen')).toHaveLength(1));
    release();
    const list = canvas.getByRole('list');
    await waitFor(() => {
      expect([...document.querySelectorAll('[data-copy="items"] > *')].flatMap(played).map(({ verb }) => verb)).toEqual(Array(4).fill('wash'));
      expect(played(list)).toEqual([{ verb: 'ripple', ms: 680, el: list.firstElementChild }]);
    });
    finish(canvasElement);
    await waitFor(() => expect(document.querySelector('[data-copy]')).toBeNull());
  },
};

/** Viewing another account: its feed, with no "Mark all seen", which would change it. */
export const Viewing: Story = {
  args: { items: fullHome.feed },
  beforeEach: () => {
    mockApi({ '/api/status': viewingStatus });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4);
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Mark all seen' })).toBeNull());
  },
};
