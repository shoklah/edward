// A water surface over the page: light only (specular and caustics), drawn while a drop's wave is running and not a frame more.
const surface = (() => {
  const c = Object.assign(document.createElement('canvas'), { className: 'm-surface', ariaHidden: 'true' });
  const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return { drip() {} };
  const N = 14, sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, `#version 300 es
  void main() { vec2 v = vec2(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1.); gl_Position = vec4(v, 0., 1.); }`));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `#version 300 es
  precision highp float; out vec4 o; uniform vec2 size; uniform float time, dark; uniform int n; uniform vec4 src[${N}]; uniform vec2 shape[${N}]; // x, y, front, strength; train, seed
  float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5); }
  float noise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float height(vec2 q) {
    float h = 0.;
    for (int i = 0; i < n; i++) {
      vec2 v = q - src[i].xy; float d = length(v) + (noise(q * .011 + shape[i].y) - .5) * shape[i].x * .34 + (noise(q * .035 - time * .4) - .5) * 7.;
      float e = src[i].z - d, env = e < 0. ? exp(-e * e / 260.) : exp(-e / (shape[i].x * .42)) * smoothstep(0., 8., e + 8.);
      h += src[i].w * env * cos(e * 6.2832 / (shape[i].x * .3 + 12.));
    }
    return h * 7.;
  }
  void main() {
    vec2 q = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
    float h = height(q), hx = height(q + vec2(1.5, 0)), hy = height(q + vec2(0, 1.5)), lx = height(q - vec2(1.5, 0)), ly = height(q - vec2(0, 1.5));
    vec3 nrm = normalize(vec3(lx - hx, ly - hy, 5.)); float lap = hx + lx + hy + ly - 4. * h;
    float act = clamp(abs(h) * .5 + length(nrm.xy) * 2., 0., 1.); if (act < .004) { o = vec4(0); return; }
    vec3 half3 = normalize(vec3(-.42, -.58, 1.)); float spec = pow(max(dot(nrm, half3), 0.), 70.) * length(nrm.xy) * 3.2;
    float flat_ = pow(max(dot(vec3(0, 0, 1), half3), 0.), 70.); spec = max(0., spec - flat_ * .2);
    float caus = clamp(-lap * .55, 0., 1.), slope = clamp(dot(nrm.xy, vec2(.6, .8)) * 2.4, -1., 1.);
    vec3 tint = mix(vec3(.49, .98, 1.), vec3(1., .35, .75), .5 + .5 * sin(atan(nrm.y, nrm.x) + q.x * .004));
    vec3 light = vec3(1.) * spec * 1.1 + tint * (caus * .5 + max(0., -slope) * .16);
    float shade = max(0., slope) * mix(.16, .30, dark);
    if (dark > .5) o = vec4(light + vec3(.05, .02, .2) * shade, clamp(shade + spec * .5, 0., .85));
    else { vec3 ink = mix(vec3(.17, .52, .77), vec3(.47, .29, .63), .5 + .5 * sin(q.x * .004)); float a = clamp(shade * 2.2 + caus * .22, 0., .55); o = vec4(ink * a + vec3(spec), clamp(a + spec, 0., 1.)); }
  }`));
  gl.linkProgram(p); gl.useProgram(p);
  const u = Object.fromEntries(['size', 'time', 'dark', 'n', 'src', 'shape'].map((x) => [x, gl.getUniformLocation(p, x)]));
  let drops = [], running = false;
  const fit = () => { if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; gl.viewport(0, 0, c.width, c.height); } };
  function frame(t) {
    drops = drops.filter((d) => t - d.t0 < d.ms * k);
    if (!drops.length) { running = false; gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); c.remove(); return; }
    const a = new Float32Array(N * 4), b = new Float32Array(N * 2);
    drops.slice(-N).forEach((d, i) => { const f = Math.max(0, t - d.t0) / (d.ms * k), front = d.R * (1 - Math.pow(1 - f, d.pow)); a.set([d.x, d.y, front, d.amp * Math.min(1, f * 10) * Math.pow(1 - f, 0.8)], i * 4); b.set([d.train, d.seed], i * 2); });
    gl.uniform2f(u.size, c.width, c.height); gl.uniform1f(u.time, t / 1000); gl.uniform1f(u.dark, document.documentElement.classList.contains('dark') ? 1 : 0); gl.uniform1i(u.n, Math.min(N, drops.length)); gl.uniform4fv(u.src, a); gl.uniform2fv(u.shape, b);
    gl.drawArrays(gl.TRIANGLES, 0, 3); requestAnimationFrame(frame);
  }
  return { drip(x, y, o) { drops.push({ x, y, t0: performance.now(), seed: Math.random() * 50, ...o }); if (!running) { running = true; fit(); document.body.append(c); requestAnimationFrame(frame); } } };
})();
