/**
 * Generates every brand asset from one description of the mark, so the logo,
 * favicons, README banner and social preview can never drift apart.
 *
 *   npm run brand
 *
 * SVGs are written directly; PNGs are rendered from them with headless Chromium.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const PUBLIC = path.join(ROOT, 'apps/web/public');

const INK = '#0B0C0E';
const PAPER = '#E6E8EB';
const MUTED = '#9BA1A9';
const FAINT = '#646B75';
const LINE = '#23272D';
const LINE_STRONG = '#343A42';
const AMBER = '#F2A14A';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * The mark on a 64-unit grid: the listener (centre dot), a near ring, and an
 * outer ring broken by a single sound at the upper right.
 */
function mark(colour: string, accent: string, stroke = 4): string {
  return [
    `<circle cx="32" cy="32" r="4.5" fill="${colour}"/>`,
    `<circle cx="32" cy="32" r="14" fill="none" stroke="${colour}" stroke-width="${stroke}"/>`,
    `<path d="M55.93 21.84A26 26 0 1 1 42.16 8.07" fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    `<circle cx="50.38" cy="13.62" r="5.25" fill="${accent}"/>`,
  ].join('\n  ');
}

const svg = (width: number, height: number, body: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${attrs}>\n  ${body}\n</svg>\n`;

/** Full-colour logo on its dark tile. */
const logo = svg(
  64,
  64,
  `<title>Earshot</title>\n  <rect width="64" height="64" rx="14" fill="${INK}"/>\n  <g transform="translate(8 8) scale(0.75)">\n  ${mark(PAPER, AMBER)}\n  </g>`,
  'role="img"',
);

/** One-colour logo that takes the surrounding text colour. */
const logoMono = svg(
  64,
  64,
  `<title>Earshot</title>\n  ${mark('currentColor', 'currentColor')}`,
  'role="img"',
);

/** Favicon: the same mark with heavier strokes so it survives at 16 px. */
const favicon = svg(
  64,
  64,
  `<rect width="64" height="64" rx="14" fill="${INK}"/>\n  <g transform="translate(6 6) scale(0.8125)">\n  ${mark(PAPER, AMBER, 5.5)}\n  </g>`,
);

interface Dot {
  angle: number;
  distance: number;
  selected?: boolean;
}

/** A stylised radar, drawn the way the app draws it. */
function radar(cx: number, cy: number, radius: number, dots: Dot[]): string {
  const parts: string[] = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#0E1013"/>`);
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${radius * ring}" fill="none" stroke="${ring === 1 ? LINE_STRONG : LINE}" stroke-width="1.5"/>`,
    );
  }
  parts.push(
    `<path d="M${cx} ${cy - radius}V${cy + radius}M${cx - radius} ${cy}H${cx + radius}" stroke="${LINE}" stroke-width="1.5"/>`,
  );
  for (let angle = 0; angle < 360; angle += 15) {
    const length = angle % 90 === 0 ? 12 : angle % 45 === 0 ? 8 : 5;
    parts.push(
      `<path d="M${cx} ${cy - radius - 8}v${-length}" stroke="${angle % 45 === 0 ? FAINT : LINE_STRONG}" stroke-width="1.5" stroke-linecap="round" transform="rotate(${angle} ${cx} ${cy})"/>`,
    );
  }
  const place = (dot: Dot) => {
    const theta = (dot.angle * Math.PI) / 180;
    return {
      x: cx + Math.sin(theta) * dot.distance * radius,
      y: cy - Math.cos(theta) * dot.distance * radius,
    };
  };
  for (const dot of dots.filter((d) => d.selected)) {
    const at = place(dot);
    parts.push(
      `<path d="M${cx} ${cy}L${at.x.toFixed(1)} ${at.y.toFixed(1)}" stroke="${AMBER}" stroke-width="1.5" stroke-dasharray="2 6" stroke-linecap="round" opacity="0.8"/>`,
    );
  }
  // The listener, nose pointing up.
  parts.push(
    `<g transform="translate(${cx} ${cy})" fill="#20242A" stroke="${MUTED}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`,
    `<path d="M-6 -15L0 -25L6 -15"/><circle r="16"/>`,
    `</g>`,
  );
  for (const dot of dots) {
    const at = place(dot);
    const x = at.x.toFixed(1);
    const y = at.y.toFixed(1);
    if (dot.selected) {
      parts.push(
        `<circle cx="${x}" cy="${y}" r="30" fill="none" stroke="${AMBER}" stroke-width="1.5" opacity="0.25"/>`,
        `<circle cx="${x}" cy="${y}" r="18" fill="none" stroke="${AMBER}" stroke-width="1.5" opacity="0.6"/>`,
        `<circle cx="${x}" cy="${y}" r="8.5" fill="${AMBER}"/>`,
      );
    } else {
      parts.push(`<circle cx="${x}" cy="${y}" r="7.5" fill="#C9CDD3"/>`);
    }
  }
  return parts.join('\n  ');
}

const DOTS: Dot[] = [
  { angle: 315, distance: 0.62 },
  { angle: 250, distance: 0.4 },
  { angle: 60, distance: 0.5, selected: true },
  { angle: 180, distance: 0.3 },
];

function lockup(x: number, y: number, scale: number): string {
  const size = 64 * scale;
  return [
    `<g transform="translate(${x} ${y}) scale(${scale})">\n  ${mark(PAPER, AMBER)}\n  </g>`,
    `<text x="${x + size + 22 * scale}" y="${y + size * 0.5}" dominant-baseline="central" font-family="${FONT}" font-size="${58 * scale}" font-weight="650" letter-spacing="${-1.2 * scale}" fill="${PAPER}">Earshot</text>`,
  ].join('\n  ');
}

/** README banner. */
const hero = svg(
  1280,
  400,
  [
    `<title>Earshot — Place a sound. Hear it there.</title>`,
    `<defs><clipPath id="frame"><rect width="1280" height="400" rx="20"/></clipPath></defs>`,
    `<g clip-path="url(#frame)">`,
    `<rect width="1280" height="400" fill="${INK}"/>`,
    radar(960, 200, 250, DOTS),
    `</g>`,
    lockup(88, 112, 1),
    `<text x="88" y="238" font-family="${FONT}" font-size="30" font-weight="500" fill="${PAPER}">Place a sound. Hear it there.</text>`,
    `<text x="88" y="282" font-family="${FONT}" font-size="19" fill="${MUTED}">A self-hosted spatial audio scene designer.</text>`,
    `<rect x="0.5" y="0.5" width="1279" height="399" rx="19.5" fill="none" stroke="${LINE}"/>`,
  ].join('\n  '),
  'role="img"',
);

/** GitHub social preview, 1280 × 640 with generous safe margins. */
const social = svg(
  1280,
  640,
  [
    `<rect width="1280" height="640" fill="${INK}"/>`,
    radar(940, 320, 230, DOTS),
    lockup(110, 210, 1.15),
    `<text x="110" y="356" font-family="${FONT}" font-size="36" font-weight="500" fill="${PAPER}">Place a sound. Hear it there.</text>`,
    `<text x="110" y="408" font-family="${FONT}" font-size="23" fill="${MUTED}">A self-hosted spatial audio scene designer.</text>`,
  ].join('\n  '),
);

await mkdir(ASSETS, { recursive: true });
await mkdir(PUBLIC, { recursive: true });

const vectors: [string, string][] = [
  [path.join(ASSETS, 'logo.svg'), logo],
  [path.join(ASSETS, 'logo-mono.svg'), logoMono],
  [path.join(ASSETS, 'favicon.svg'), favicon],
  [path.join(ASSETS, 'hero.svg'), hero],
  [path.join(PUBLIC, 'favicon.svg'), favicon],
];
for (const [file, contents] of vectors) await writeFile(file, contents);

const rasters: { file: string; source: string; width: number; height: number }[] = [
  { file: path.join(ASSETS, 'social-preview.png'), source: social, width: 1280, height: 640 },
  { file: path.join(ASSETS, 'favicon-32.png'), source: favicon, width: 32, height: 32 },
  { file: path.join(ASSETS, 'favicon-180.png'), source: favicon, width: 180, height: 180 },
  { file: path.join(PUBLIC, 'favicon-32.png'), source: favicon, width: 32, height: 32 },
  { file: path.join(PUBLIC, 'apple-touch-icon.png'), source: favicon, width: 180, height: 180 },
];

const browser = await chromium.launch();
try {
  for (const { file, source, width, height } of rasters) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const sized = source.replace(/width="\d+" height="\d+"/, `width="${width}" height="${height}"`);
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`,
    );
    await page.screenshot({ path: file, omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}

for (const file of [...vectors.map(([f]) => f), ...rasters.map((r) => r.file)]) {
  console.log(path.relative(ROOT, file));
}
