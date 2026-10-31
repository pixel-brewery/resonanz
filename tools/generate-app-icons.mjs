// #region Imports

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

// #endregion

const root = resolve('resources/icons');
const source = await readFile(resolve(root, 'resonanz-mark.svg'), 'utf8');
const mark = source.match(/<g\s+id="resonanz-mark"[\s\S]*?<\/g>/u)?.[0];
if (!mark) throw new Error('Die kanonische Resonanz-Bildmarke fehlt.');

const appSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" style="color:#087f8c">
  <rect x="48" y="48" width="928" height="928" rx="224" fill="#fafaf9"/>
  <g transform="translate(128 128) scale(24)">${mark}</g>
</svg>\n`;
await writeFile(resolve(root, 'resonanz.svg'), appSvg);
const appDirectory = resolve(root, 'png/app');
const trayDirectory = resolve(root, 'png/tray');
const markDirectory = resolve(root, 'png/mark');
await Promise.all(
  [appDirectory, trayDirectory, markDirectory].map((path) => mkdir(path, { recursive: true })),
);

for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 180, 192, 256, 512, 1024]) {
  await render(appSvg, size, resolve(appDirectory, `resonanz-${size}.png`));
}
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  await render(source, size, resolve(markDirectory, `resonanz-mark-${size}.png`));
}
for (const [suffix, badge] of [
  ['', ''],
  ['-recording', '<circle cx="27" cy="5" r="3" fill="currentColor"/>'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" style="color:#000">${mark}${badge}</svg>`;
  await render(svg, 24, resolve(trayDirectory, `resonanz-tray${suffix}.png`));
  await render(svg, 48, resolve(trayDirectory, `resonanz-tray${suffix}@2x.png`));
  await render(svg, 24, resolve(trayDirectory, `resonanz${suffix}Template.png`));
  await render(svg, 48, resolve(trayDirectory, `resonanz${suffix}Template@2x.png`));
}

const icoImages = await Promise.all(
  [16, 24, 32, 48, 64, 128, 256].map(async (size) => ({
    size,
    data: await readFile(resolve(appDirectory, `resonanz-${size}.png`)),
  })),
);
await writeFile(resolve(root, 'resonanz.ico'), createIco(icoImages));
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
console.log('Resonanz: SVG, PNG, Tray-Vorlagen, ICO und ICNS erzeugt.');

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
