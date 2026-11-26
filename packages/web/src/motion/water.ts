import { frontAt, type Front } from './bend.ts';
import { motionRuns } from './play.ts';

/** One drop's wave: its reach in px, its time, its strength, how it slows (`pow`) and the length of its train in px. */
export type Drop = Pick<Front, 'R' | 'ms' | 'pow'> & { amp: number; train: number };

/** The most drops the shader sums. */
const MOST = 14;
const VERTEX = `#version 300 es
void main() { vec2 v = vec2(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1.); gl_Position = vec4(v, 0., 1.); }`;
// Light only: speculars, and caustics tinted by the backdrop in dark, blue and violet shade in light.
const FRAGMENT = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 size;
uniform float time, dark;
uniform int n;
uniform vec4 src[${MOST}]; // x, y, front, strength
uniform vec2 shape[${MOST}]; // train, seed
float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5); }
float noise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float height(vec2 q) {
  float h = 0.;
  for (int i = 0; i < n; i++) {
    vec2 v = q - src[i].xy;
    float d = length(v) + (noise(q * .011 + shape[i].y) - .5) * shape[i].x * .34 + (noise(q * .035 - time * .4) - .5) * 7.;
    float e = src[i].z - d, env = e < 0. ? exp(-e * e / 260.) : exp(-e / (shape[i].x * .42)) * smoothstep(0., 8., e + 8.);
    h += src[i].w * env * cos(e * 6.2832 / (shape[i].x * .3 + 12.));
  }
  return h * 7.;
}
void main() {
  vec2 q = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  float h = height(q), hx = height(q + vec2(1.5, 0)), hy = height(q + vec2(0, 1.5)), lx = height(q - vec2(1.5, 0)), ly = height(q - vec2(0, 1.5));
  vec3 nrm = normalize(vec3(lx - hx, ly - hy, 5.));
  float lap = hx + lx + hy + ly - 4. * h;
  float act = clamp(abs(h) * .5 + length(nrm.xy) * 2., 0., 1.);
  if (act < .004) { o = vec4(0); return; }
  vec3 half3 = normalize(vec3(-.42, -.58, 1.));
  float spec = pow(max(dot(nrm, half3), 0.), 70.) * length(nrm.xy) * 3.2;
  float flat_ = pow(max(dot(vec3(0, 0, 1), half3), 0.), 70.);
  spec = max(0., spec - flat_ * .2);
  float caus = clamp(-lap * .55, 0., 1.), slope = clamp(dot(nrm.xy, vec2(.6, .8)) * 2.4, -1., 1.);
  vec3 tint = mix(vec3(.49, .98, 1.), vec3(1., .35, .75), .5 + .5 * sin(atan(nrm.y, nrm.x) + q.x * .004));
  vec3 light = vec3(1.) * spec * 1.1 + tint * (caus * .5 + max(0., -slope) * .16);
  float shade = max(0., slope) * mix(.16, .30, dark);
  if (dark > .5) o = vec4(light + vec3(.05, .02, .2) * shade, clamp(shade + spec * .5, 0., .85));
  else {
    vec3 ink = mix(vec3(.17, .52, .77), vec3(.47, .29, .63), .5 + .5 * sin(q.x * .004));
    float a = clamp(shade * 2.2 + caus * .22, 0., .55);
    o = vec4(ink * a + vec3(spec), clamp(a + spec, 0., 1.));
  }
}`;

type Water = { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; at: Record<string, WebGLUniformLocation | null> };

/** The canvas and its program, made at the first drop; null with no WebGL2 or once its context is lost: no light then. */
let water: Water | null | undefined;
let drops: (Drop & { x: number; y: number; start: number; seed: number })[] = [];
let running = false;

function make(): Water | null {
  const canvas = document.createElement('canvas');
  canvas.ariaHidden = 'true';
  canvas.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 90; pointer-events: none';
  canvas.addEventListener('webglcontextlost', () => {
    water = null;
    canvas.remove();
  });
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  gl.useProgram(program);
  return { canvas, gl, at: Object.fromEntries(['size', 'time', 'dark', 'n', 'src', 'shape'].map((name) => [name, gl.getUniformLocation(program, name)])) };
}

function frame(now: number): void {
  if (!water) return;
  const { canvas, gl, at } = water;
  drops = drops.filter(({ start, ms }) => now - start < ms);
  if (drops.length === 0) {
    running = false;
    canvas.remove();
    return;
  }
  const src = new Float32Array(MOST * 4);
  const shape = new Float32Array(MOST * 2);
  drops.slice(-MOST).forEach(({ x, y, start, seed, R, ms, amp, pow, train }, i) => {
    const done = Math.max(0, now - start) / ms;
    src.set([x, y, frontAt({ R, pow }, done), amp * Math.min(1, done * 10) * (1 - done) ** 0.8], i * 4);
    shape.set([train, seed], i * 2);
  });
  gl.uniform2f(at.size, canvas.width, canvas.height);
  gl.uniform1f(at.time, now / 1000);
  gl.uniform1f(at.dark, document.documentElement.classList.contains('dark') ? 1 : 0);
  gl.uniform1i(at.n, Math.min(MOST, drops.length));
  gl.uniform4fv(at.src, src);
  gl.uniform2fv(at.shape, shape);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}

/** A drop falls at a place in the window: its light runs out over the page, on a canvas that is there only meanwhile. */
export function drop(x: number, y: number, drop: Drop): void {
  fall('wave', x, y, drop);
}

/** A drop falls unseen, out of the window, so the shader is compiled and has run before the first real one. */
export function warm(): void {
  fall('prepare', -400, -400, { R: 10, ms: 300, amp: 0.01, pow: 1, train: 40 });
}

function fall(kind: 'wave' | 'prepare', x: number, y: number, drop: Drop): void {
  if (!motionRuns()) return;
  if (water === undefined) water = make();
  if (!water) return;
  drops.push({ ...drop, x, y, start: performance.now(), seed: Math.random() * 50 });
  // A wave's canvas stays one.
  if (kind === 'wave' || !running) water.canvas.dataset.water = kind;
  if (running) return;
  running = true;
  const { canvas, gl } = water;
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  document.body.append(canvas);
  requestAnimationFrame(frame);
}
