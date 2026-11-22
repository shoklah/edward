import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../deploy/update.sh', import.meta.url));

// Every test here starts many processes (git, bash and the stubs), which takes seconds on a busy machine.
vi.setConfig({ testTimeout: 60_000 });

const HOST = 'edward.example';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function stub(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}`);
  chmodSync(path, 0o755);
}

/** A temp folder with an origin, its checkout `edward/`, and stub docker, curl and sleep in `bin/`. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'cwd deploy '));
  dirs.push(dir);
  const origin = join(dir, 'origin.git');
  const edward = join(dir, 'edward');
  const work = join(dir, 'work');
  const bin = join(dir, 'bin');
  const deploy = join(edward, 'deploy');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, edward);
  git(edward, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  mkdirSync(deploy);
  writeFileSync(join(deploy, 'compose.example.yml'), 'services: {}\n');
  git(edward, 'add', '.');
  git(edward, 'commit', '-q', '-m', 'first');
  git(edward, 'push', '-q', 'origin', 'main');
  git(dir, 'clone', '-q', origin, work);

  mkdirSync(bin);
  const t = `T='${dir}'\necho "$(basename "$0") $*" >> "$T/calls.log"\n`;
  stub(
    join(bin, 'docker'),
    `${t}case "$*" in
  compose*' build') [ -e "$T/fail-build" ] && exit 1 ;;
  compose*' stop edward') [ -e "$T/fail-stop" ] && exit 1 ;;
  run*' cp -a /data '*) [ -e "$T/fail-copy" ] && exit 1 ;;
  run*' cp -a /backups/'*) [ -e "$T/fail-restore" ] && exit 1 ;;
esac
exit 0
`,
  );
  stub(
    join(bin, 'curl'),
    `${t}case "$*" in
  *check-runs*) [ -e "$T/fail-api" ] && exit 22; cat "$T/check-runs.json" ;;
  */signin*)
    if [ -s "$T/health" ]; then
      head -n 1 "$T/health"; tail -n +2 "$T/health" > "$T/health.next"; mv "$T/health.next" "$T/health"
    else
      printf 000
    fi ;;
esac
exit 0
`,
  );
  stub(join(bin, 'sleep'), t);

  const head = () => git(edward, 'rev-parse', 'HEAD');

  /** Commits a change in a second clone and pushes it, returning its sha. */
  const push = (): string => {
    writeFileSync(join(work, 'change.txt'), `${Math.random()}\n`);
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'change');
    git(work, 'push', '-q', 'origin', 'main');
    return git(work, 'rev-parse', 'HEAD');
  };

  /** Writes check-runs.json from GitHub Actions runs, plus one run from another app, which must be ignored. */
  const checks = (...runs: { status: string; conclusion: string | null }[]): void => {
    const other = { status: 'queued', conclusion: null, app: { slug: 'other-app' } };
    const check_runs = [...runs.map((run) => ({ ...run, app: { slug: 'github-actions' } })), other];
    writeFileSync(join(dir, 'check-runs.json'), JSON.stringify({ total_count: check_runs.length, check_runs }));
  };

  const flag = (name: string, text = ''): void => writeFileSync(join(dir, name), text);

  const run = (env: Record<string, string> = { EDWARD_PUBLIC_HOST: HOST }) => {
    const base: Record<string, string | undefined> = { ...process.env, ...GIT_ENV };
    delete base.EDWARD_PUBLIC_HOST;
    const result = spawnSync('/bin/bash', [SCRIPT], {
      cwd: deploy,
      encoding: 'utf8',
      env: { ...base, ...env, PATH: `${bin}:${process.env.PATH}` },
    });
    const log = join(dir, 'calls.log');
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    rmSync(log, { force: true });
    return { status: result.status, stdout: result.stdout, calls };
  };

  const state = (name: string): string | null => {
    const file = join(deploy, 'state', name);
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
  };

  return { dir, edward, deploy, head, push, checks, flag, run, state };
}

const short = (sha: string) => sha.slice(0, 7);
const docker = (calls: string[]) => calls.filter((call) => call.startsWith('docker '));
const COPY_NAME = /^\d{8}T\d{6}Z-[0-9a-f]{7}$/;

describe('update.sh', () => {
  test('exits silently when the checkout is on origin/main', () => {
    const t = setup();
    const { status, stdout, calls } = t.run();
    expect(status).toBe(0);
    expect(stdout).toBe('');
    expect(docker(calls)).toEqual([]);
  });

  test('stays silent while any check run is not completed', () => {
    const t = setup();
    const old = t.head();
    t.push();
    t.checks({ status: 'completed', conclusion: 'success' }, { status: 'queued', conclusion: null });
    const { status, stdout, calls } = t.run();
    expect(status).toBe(0);
    expect(stdout).toBe('');
    expect(t.head()).toBe(old);
    expect(docker(calls)).toEqual([]);
  });

  test('stays silent while GitHub Actions has no check run yet', () => {
    const t = setup();
    t.push();
    t.checks();
    const { status, stdout, calls } = t.run();
    expect(status).toBe(0);
    expect(stdout).toBe('');
    expect(docker(calls)).toEqual([]);
  });

  test('refuses to start without EDWARD_PUBLIC_HOST', () => {
    const t = setup();
    const old = t.head();
    t.push();
    const { status, stdout } = t.run({});
    expect(stdout).toBe('EDWARD_PUBLIC_HOST is not set\n');
    expect(status).toBe(1);
    expect(t.head()).toBe(old);
    expect(existsSync(join(t.edward, '.git', 'FETCH_HEAD'))).toBe(false);
  });

  test('refuses a commit whose CI failed, once', () => {
    const t = setup();
    const sha = t.push();
    t.checks({ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' });
    const first = t.run();
    expect(first.stdout).toBe(`new commit ${short(sha)}\nCI failed on ${short(sha)}\n`);
    expect(first.status).toBe(1);
    expect(t.state('refused')).toBe(sha);
    const second = t.run();
    expect(second.stdout).toBe('');
    expect(second.status).toBe(0);
  });

  test('logs a GitHub API error', () => {
    const t = setup();
    t.push();
    t.flag('fail-api');
    const { status, stdout } = t.run();
    expect(stdout.endsWith('GitHub API error\n')).toBe(true);
    expect(status).toBe(1);
    expect(t.state('refused')).toBeNull();
  });

  test('refuses to deploy when HEAD is not behind origin/main', () => {
    const t = setup();
    t.push();
    writeFileSync(join(t.edward, 'local.txt'), 'local\n');
    git(t.edward, 'add', '.');
    git(t.edward, 'commit', '-q', '-m', 'local');
    const head = t.head();
    t.checks({ status: 'completed', conclusion: 'success' });
    const { status, stdout, calls } = t.run();
    expect(stdout).toContain(`not a fast-forward of ${short(head)}, not deploying\n`);
    expect(status).toBe(1);
    expect(docker(calls)).toEqual([]);
  });

  test('first deploy from a bare checkout', () => {
    const t = setup();
    const old = t.head();
    const sha = t.push();
    t.checks({ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' });
    t.flag('health', '000\n000\n200\n');
    const { status, stdout, calls } = t.run();
    expect(status).toBe(0);

    const health = calls.filter((call) => call.startsWith('curl ') && call.includes('/signin'));
    expect(health).toHaveLength(3);
    for (const call of health) {
      expect(call).toContain(`-H Host: ${HOST}`);
      expect(call).toContain('http://127.0.0.1:4317/signin');
    }

    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(`new commit ${short(sha)}`);
    expect(lines[1]).toBe(`building ${short(sha)}`);
    const name = lines[2].replace('backed up data to backups/', '');
    expect(name).toMatch(COPY_NAME);
    expect(name.endsWith(`-${short(old)}`)).toBe(true);
    expect(lines[3]).toBe(`started ${short(sha)}`);
    expect(lines[4]).toBe(`deployed ${short(sha)}`);
    expect(t.head()).toBe(sha);

    const order = [
      (call: string) => call === 'docker tag edward-hosted edward-hosted:previous',
      (call: string) => call === 'docker compose -f compose.example.yml build',
      (call: string) => call === 'docker compose -f compose.example.yml stop edward',
      (call: string) =>
        call.startsWith('docker run --rm -u 0 ') &&
        call.includes(' edward-hosted:previous cp -a ') &&
        call.includes(`/backups/${name}`),
      (call: string) => call === 'docker compose -f compose.example.yml up -d --no-build edward',
      (call: string) => call === 'docker image prune -f',
    ];
    const ds = docker(calls);
    const at = order.map((match) => ds.findIndex(match));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(t.state('deploying')).toBeNull();
  });

  test('passes the proxy override when it exists', () => {
    const t = setup();
    t.push();
    t.checks({ status: 'completed', conclusion: 'success' });
    t.flag('health', '200\n');
    writeFileSync(join(t.deploy, 'compose.proxy.local.yml'), 'services: {}\n');
    const { status, calls } = t.run();
    expect(status).toBe(0);
    const compose = calls.filter((call) => call.startsWith('docker compose '));
    expect(compose.length).toBeGreaterThanOrEqual(3);
    for (const call of compose) expect(call).toContain('-f compose.example.yml -f compose.proxy.local.yml');
  });

  test('keeps the three newest copies', () => {
    const t = setup();
    t.push();
    t.checks({ status: 'completed', conclusion: 'success' });
    t.flag('health', '200\n');
    const earlier = ['20250101T000000Z-aaaaaaa', '20250102T000000Z-bbbbbbb', '20250103T000000Z-ccccccc', '20250104T000000Z-ddddddd'];
    for (const name of earlier) mkdirSync(join(t.deploy, 'backups', name), { recursive: true });
    const { status, calls } = t.run();
    expect(status).toBe(0);
    const removed = calls.filter((call) => call.includes(' rm -rf '));
    expect(removed).toHaveLength(2);
    expect(removed[0].endsWith(` rm -rf /backups/${earlier[0]}`)).toBe(true);
    expect(removed[1].endsWith(` rm -rf /backups/${earlier[1]}`)).toBe(true);
  });

  test('a failed build leaves the old version running', () => {
    const t = setup();
    const old = t.head();
    const sha = t.push();
    t.checks({ status: 'completed', conclusion: 'success' });
    t.flag('fail-build');
    const { status, stdout, calls } = t.run();
    expect(status).toBe(1);
    expect(stdout.endsWith(`build failed for ${short(sha)}\n`)).toBe(true);
    expect(t.head()).toBe(old);
    expect(calls).toContain('docker tag edward-hosted:previous edward-hosted');
    expect(calls.some((call) => call.includes(' stop '))).toBe(false);
    expect(t.state('refused')).toBe(sha);
    expect(t.state('deploying')).toBeNull();
  });

  test('a failed copy restarts the old version', () => {
    const t = setup();
    const old = t.head();
    const sha = t.push();
    t.checks({ status: 'completed', conclusion: 'success' });
    t.flag('fail-copy');
    const { status, stdout, calls } = t.run();
    expect(status).toBe(1);
    expect(stdout.endsWith(`backup failed, ${short(old)} restarted\n`)).toBe(true);
    expect(t.head()).toBe(old);
    const ds = docker(calls);
    expect(ds.slice(-2)).toEqual([
      'docker tag edward-hosted:previous edward-hosted',
      'docker compose -f compose.example.yml up -d --no-build edward',
    ]);
    const copy = ds.find((call) => call.includes(' cp -a /data '));
    const name = copy?.split('/backups/').pop();
    expect(name).toMatch(COPY_NAME);
    expect(ds.some((call) => call.endsWith(` rm -rf /backups/${name}`))).toBe(true);
    expect(t.state('deploying')).toBeNull();
    expect(t.state('refused')).toBe(sha);
  });

  test('a failed stop restarts the old version', () => {
    const t = setup();
    const old = t.head();
    const sha = t.push();
    t.checks({ status: 'completed', conclusion: 'success' });
    t.flag('fail-stop');
    const { status, stdout, calls } = t.run();
    expect(status).toBe(1);
    expect(stdout.endsWith(`backup failed, ${short(old)} restarted\n`)).toBe(true);
    expect(t.head()).toBe(old);
    expect(docker(calls).slice(-2)).toEqual([
      'docker tag edward-hosted:previous edward-hosted',
      'docker compose -f compose.example.yml up -d --no-build edward',
    ]);
    expect(calls.some((call) => call.includes(' cp '))).toBe(false);
    expect(t.state('deploying')).toBeNull();
    expect(t.state('refused')).toBe(sha);
  });
});
