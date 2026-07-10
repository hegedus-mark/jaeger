/** 16-colour palette matching Jaeger's look, dark-mode friendly */
const PALETTE = [
  '#00d4aa', // teal (primary)
  '#4e8ef7', // blue
  '#f4845f', // orange
  '#e15759', // red
  '#76b7b2', // cyan
  '#59a14f', // green
  '#edc948', // yellow
  '#b07aa1', // purple
  '#ff9da7', // pink
  '#9c755f', // brown
  '#f28e2b', // amber
  '#72b7ef', // light blue
  '#e377c2', // magenta
  '#17becf', // dark cyan
  '#bcbd22', // olive
  '#aecbfa', // lavender
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const colorCache = new Map<string, string>();

export function getServiceColor(serviceName: string): string {
  if (colorCache.has(serviceName)) return colorCache.get(serviceName)!;
  const color = PALETTE[hashCode(serviceName) % PALETTE.length];
  colorCache.set(serviceName, color);
  return color;
}
