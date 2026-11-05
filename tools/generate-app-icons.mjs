// #region Imports

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { resonanzTheme } from '../resources/themes/resonanz-soho.ts';

// #endregion

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(workspaceRoot, 'resources/icons');
const trayOnly = process.argv.slice(2).includes('--tray-only');
const source = await readFile(resolve(root, 'resonanz-mark.svg'), 'utf8');
const mark = source.match(/<g\s+id="resonanz-mark"[\s\S]*?<\/g>/u)?.[0];
if (!mark) throw new Error('The canonical Resonanz mark is missing.');

// App artwork takes the approved warm wine ramp directly from the product theme.
// The native tray keeps its independent monochrome/state contract below.
const wine = resonanzTheme.palette.light.primary;
const squircle =
  'M304 80H720C862 80 944 162 944 304V720C944 862 862 944 720 944H304C162 944 80 862 80 720V304C80 162 162 80 304 80Z';
const appMark = mark.replaceAll('currentColor', 'url(#glyph-ink)');
const appSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Resonanz">
  <defs>
    <linearGradient id="wine-body" x1="190" y1="80" x2="800" y2="944" gradientUnits="userSpaceOnUse">
      <stop stop-color="${wine['300']}"/>
      <stop offset=".30" stop-color="${wine['500']}"/>
      <stop offset=".72" stop-color="${wine['600']}"/>
      <stop offset="1" stop-color="${wine['800']}"/>
    </linearGradient>
    <radialGradient id="surface-light" cx=".25" cy=".02" r="1.04">
      <stop stop-color="${wine['100']}" stop-opacity=".38"/>
      <stop offset=".55" stop-color="${wine['100']}" stop-opacity=".05"/>
      <stop offset="1" stop-color="${wine['100']}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="edge-light" x1="180" y1="80" x2="830" y2="944" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity=".66"/>
      <stop offset=".4" stop-color="#ffffff" stop-opacity=".12"/>
      <stop offset="1" stop-color="${wine['900']}" stop-opacity=".68"/>
    </linearGradient>
    <linearGradient id="inset-light" x1="512" y1="80" x2="512" y2="944" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity=".21"/>
      <stop offset=".65" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="glyph-ink" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="1" stop-color="${resonanzTheme.scheme.light.background}"/>
    </linearGradient>
    <filter id="tile-shadow" x="-20%" y="-15%" width="140%" height="145%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="${wine['900']}" flood-opacity=".25"/>
    </filter>
    <filter id="glyph-depth" x="-20%" y="-20%" width="140%" height="145%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="7" stdDeviation="4" flood-color="${wine['900']}" flood-opacity=".38"/>
    </filter>
    <filter id="surface-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="11" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <clipPath id="face"><path d="${squircle}"/></clipPath>
  </defs>
  <g filter="url(#tile-shadow)">
    <path d="${squircle}" transform="translate(0 9)" fill="${wine['900']}"/>
    <path d="${squircle}" fill="url(#wine-body)"/>
  </g>
  <g clip-path="url(#face)">
    <path d="${squircle}" fill="url(#surface-light)"/>
    <path d="${squircle}" filter="url(#surface-grain)" opacity=".025"/>
    <path d="${squircle}" fill="none" stroke="url(#edge-light)" stroke-width="4"/>
    <path d="${squircle}" transform="translate(512 512) scale(.978) translate(-512 -512)" fill="none" stroke="url(#inset-light)" stroke-width="2"/>
    <g filter="url(#glyph-depth)">
      <g transform="translate(160 160) scale(22)">${appMark}</g>
    </g>
  </g>
</svg>\n`;
const appDirectory = resolve(root, 'png/app');
const trayDirectory = resolve(root, 'png/tray');
const markDirectory = resolve(root, 'png/mark');
await mkdir(trayDirectory, { recursive: true });

if (!trayOnly) {
  await writeFile(resolve(root, 'resonanz.svg'), appSvg);
  await Promise.all([appDirectory, markDirectory].map((path) => mkdir(path, { recursive: true })));
  for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 180, 192, 256, 512, 1024]) {
    await render(appSvg, size, resolve(appDirectory, `resonanz-${size}.png`));
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await render(source, size, resolve(markDirectory, `resonanz-mark-${size}.png`));
  }
}
for (const [suffix, contents] of [
  ['', mark],
  ['-recording', '<circle cx="16" cy="16" r="7" fill="#e7000b"/>'],
  ['-paused', '<circle cx="16" cy="16" r="7" fill="#737373"/>'],
  [
    '-attention',
    `${mark}<circle cx="25" cy="7" r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>`,
  ],
  [
    '-attention-dark',
    `<g style="color:#ffffff">${mark}</g><circle cx="25" cy="7" r="5" fill="#f59e0b" stroke="#171717" stroke-width="2"/>`,
  ],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" style="color:#000">${contents}</svg>`;
  await render(svg, 24, resolve(trayDirectory, `resonanz-tray${suffix}.png`));
  await render(svg, 48, resolve(trayDirectory, `resonanz-tray${suffix}@2x.png`));
  await render(svg, 24, resolve(trayDirectory, `resonanz${suffix}Template.png`));
  await render(svg, 48, resolve(trayDirectory, `resonanz${suffix}Template@2x.png`));
}

// Windows retains the app's glyph; badges carry the same capture state as macOS dots.
for (const dark of [false, true]) {
  const glyph = dark ? `<g style="color:#ffffff">${mark}</g>` : mark;
  const backdrop = dark ? '#171717' : '#ffffff';
  for (const [state, color] of [
    ['', null],
    ['-recording', '#e7000b'],
    ['-paused', '#737373'],
  ]) {
    const badge = color
      ? `<circle cx="25" cy="25" r="5" fill="${color}" stroke="${backdrop}" stroke-width="2"/>`
      : '';
    await renderTray(`-windows${state}${dark ? '-dark' : ''}`, `${glyph}${badge}`);
  }
}

// Frame zero is the existing solid recording dot. Seven finite halo frames finish a 1.6s pulse.
for (let frame = 1; frame < 8; frame++) {
  const fraction = frame / 8;
  const halo = `<circle cx="16" cy="16" r="${7 + fraction * 9}" fill="#e7000b" opacity="${0.35 * (1 - fraction)}"/>`;
  await renderTray(
    `-recording-pulse-${frame}`,
    `${halo}<circle cx="16" cy="16" r="7" fill="#e7000b"/>`,
  );
}

if (!trayOnly) {
  const icoImages = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map(async (size) => ({
      size,
      data: await readFile(resolve(appDirectory, `resonanz-${size}.png`)),
    })),
  );
  const ico = createIco(icoImages);
  await writeFile(resolve(root, 'resonanz.ico'), ico);
  await writeFile(resolve(workspaceRoot, 'apps/renderer/public/favicon.ico'), ico);
  const icnsImages = await Promise.all(
    [
      ['icp4', 16],
      ['icp5', 32],
      ['icp6', 64],
      ['ic07', 128],
      ['ic08', 256],
      ['ic09', 512],
      ['ic10', 1024],
    ].map(async ([type, size]) => ({
      type,
      data: await readFile(resolve(appDirectory, `resonanz-${size}.png`)),
    })),
  );
  await writeFile(resolve(root, 'resonanz.icns'), createIcns(icnsImages));
}
console.log(
  trayOnly
    ? 'Resonanz: tray assets generated.'
    : 'Resonanz: SVG, PNG, tray, ICO and ICNS generated.',
);

async function renderTray(suffix, contents) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" style="color:#000">${contents}</svg>`;
  await render(svg, 24, resolve(trayDirectory, `resonanz-tray${suffix}.png`));
  await render(svg, 48, resolve(trayDirectory, `resonanz-tray${suffix}@2x.png`));
}

async function render(svg, size, destination) {
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await sharp(Buffer.from(sized), { density: 144 }).resize(size, size).png().toFile(destination);
}

// Native icon containers follow Symphony's existing format implementation.
function createIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const start = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, start);
    header.writeUInt8(size === 256 ? 0 : size, start + 1);
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(data.length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

function createIcns(images) {
  const entries = images.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
  return Buffer.concat([header, ...entries]);
}
