/** The filters' two maps, each a square around the front, drawn once per page load. */
let maps: { ring: string; disc: string } | undefined;

function drawMaps(): { ring: string; disc: string } {
  const n = 400;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const g = canvas.getContext('2d')!;
  // The displacement ring: a wave packet at 0.8 of the radius, pushing along it.
  const data = g.createImageData(n, n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i / n) * 2 - 1;
      const v = (j / n) * 2 - 1;
      const q = Math.hypot(u, v) || 1e-6;
      const e = (q - 0.8) / 0.07;
      const push = q < 1 ? Math.exp(-e * e) * Math.sin(e * 2.4) : 0;
      const at = 4 * (j * n + i);
      data.data[at] = 128 + 127 * push * (u / q);
      data.data[at + 1] = 128 + 127 * push * (v / q);
      data.data[at + 2] = 128;
      data.data[at + 3] = 255;
    }
  }
  g.putImageData(data, 0, 0);
  const ring = canvas.toDataURL();
  // What the front has passed is gone.
  const disc = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  disc.addColorStop(0, '#000');
  disc.addColorStop(0.76, '#000');
  disc.addColorStop(0.82, 'transparent');
  g.clearRect(0, 0, n, n);
  g.fillStyle = disc;
  g.fillRect(0, 0, n, n);
  return { ring, disc: canvas.toDataURL() };
}

/** The two filters `bend` runs along a front: `bend`, a ring of displacement, and `wash`, the same with everything inside
 * the front removed. Their places and sizes are `bend`'s to set. */
export function Filters() {
  const { ring, disc } = (maps ??= drawMaps());
  const filter = { filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', colorInterpolationFilters: 'sRGB' } as const;
  const displaced = (
    <>
      <feFlood floodColor="#808080" result="flat" />
      <feImage preserveAspectRatio="none" href={ring} result="ring" />
      <feMerge result="map">
        <feMergeNode in="flat" />
        <feMergeNode in="ring" />
      </feMerge>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="displaced" />
    </>
  );
  return (
    <svg width="0" height="0" aria-hidden="true" className="pointer-events-none absolute">
      <filter id="motion-bend" {...filter}>
        {displaced}
      </filter>
      <filter id="motion-wash" {...filter}>
        {displaced}
        <feImage preserveAspectRatio="none" href={disc} result="disc" />
        <feComposite in="displaced" in2="disc" operator="out" />
      </filter>
    </svg>
  );
}
