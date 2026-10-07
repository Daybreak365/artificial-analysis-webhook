import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IMAGE_PATH = 'intelligence-index.png';
const STATE_DIR = '.state';
const REFERENCE_PATH = path.join(STATE_DIR, 'last-image-reference.png');
const LEGACY_HASH_PATH = path.join(STATE_DIR, 'last-image.sha256');

// The downloaded chart can be visually identical while differing by tiny
// renderer/color/alpha details. Compare a normalized visual reference instead
// of requiring every decoded pixel to be byte-for-byte identical.
const NORMALIZED_WIDTH = 1024;
const MIN_STRONG_DIFF = 24;
const MIN_VERY_STRONG_DIFF = 48;

// A real score/label/bar change produces many high-contrast pixels.
// Small browser anti-aliasing/rendering noise should stay below these limits.
const STRONG_PIXEL_LIMIT = 120;
const VERY_STRONG_PIXEL_LIMIT = 40;
const MEAN_DIFF_LIMIT = 0.35;

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

async function normalizeToPng(input, output) {
  await sharp(input)
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .resize({
      width: NORMALIZED_WIDTH,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .blur(0.5)
    .removeAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toFile(output);
}

async function readRgb(file) {
  return sharp(file)
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

if (!fs.existsSync(IMAGE_PATH)) {
  throw new Error(`${IMAGE_PATH} does not exist.`);
}

fs.mkdirSync(STATE_DIR, { recursive: true });

const tempReference = path.join(STATE_DIR, 'current-image-reference.png');
await normalizeToPng(IMAGE_PATH, tempReference);

// Migration from the old exact-pixel SHA scheme.
// Establish a visual baseline silently so this code change itself does not
// trigger a duplicate Discord post.
if (!fs.existsSync(REFERENCE_PATH)) {
  fs.renameSync(tempReference, REFERENCE_PATH);

  if (fs.existsSync(LEGACY_HASH_PATH)) {
    fs.unlinkSync(LEGACY_HASH_PATH);
  }

  console.log('Visual comparison baseline created. Discord notification skipped for migration.');
  setOutput('changed', 'false');
  setOutput('state_updated', 'true');
  setOutput('reason', 'baseline_created');
  process.exit(0);
}

const previous = await readRgb(REFERENCE_PATH);
const current = await readRgb(tempReference);

let changed = false;
let reason = 'visually_unchanged';

if (
  previous.info.width !== current.info.width ||
  previous.info.height !== current.info.height ||
  previous.info.channels !== current.info.channels
) {
  changed = true;
  reason = 'dimensions_changed';
} else {
  const pixels = current.info.width * current.info.height;
  let strongPixels = 0;
  let veryStrongPixels = 0;
  let totalMaxDiff = 0;
  let maxObservedDiff = 0;

  for (let i = 0; i < current.data.length; i += current.info.channels) {
    let pixelDiff = 0;

    for (let c = 0; c < current.info.channels; c++) {
      const d = Math.abs(current.data[i + c] - previous.data[i + c]);
      if (d > pixelDiff) pixelDiff = d;
    }

    totalMaxDiff += pixelDiff;
    if (pixelDiff > maxObservedDiff) maxObservedDiff = pixelDiff;
    if (pixelDiff >= MIN_STRONG_DIFF) strongPixels++;
    if (pixelDiff >= MIN_VERY_STRONG_DIFF) veryStrongPixels++;
  }

  const meanDiff = totalMaxDiff / pixels;
  const strongRatio = strongPixels / pixels;
  const veryStrongRatio = veryStrongPixels / pixels;

  console.log(`Visual diff mean: ${meanDiff.toFixed(4)}`);
  console.log(`Max observed diff: ${maxObservedDiff}`);
  console.log(
    `Strong pixels (>=${MIN_STRONG_DIFF}): ${strongPixels} / ${pixels} (${(strongRatio * 100).toFixed(5)}%)`
  );
  console.log(
    `Very strong pixels (>=${MIN_VERY_STRONG_DIFF}): ${veryStrongPixels} / ${pixels} (${(veryStrongRatio * 100).toFixed(5)}%)`
  );

  changed =
    meanDiff >= MEAN_DIFF_LIMIT ||
    strongPixels >= STRONG_PIXEL_LIMIT ||
    veryStrongPixels >= VERY_STRONG_PIXEL_LIMIT;

  if (changed) {
    reason = 'meaningful_visual_change';
  }
}

if (changed) {
  fs.renameSync(tempReference, REFERENCE_PATH);
  console.log('Meaningful visual change detected.');
  setOutput('changed', 'true');
  setOutput('state_updated', 'true');
  setOutput('reason', reason);
} else {
  fs.unlinkSync(tempReference);
  console.log('Image is visually unchanged; tiny rendering differences were ignored.');
  setOutput('changed', 'false');
  setOutput('state_updated', 'false');
  setOutput('reason', reason);
}
