import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const IMAGE_PATH = 'intelligence-index.png';
const STATE_DIR = '.state';
const HASH_PATH = path.join(STATE_DIR, 'last-image.sha256');

async function pixelHash(file) {
  // Decode to raw RGBA pixels so PNG metadata/compression changes do not
  // count as an update when the visible chart is identical.
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const h = crypto.createHash('sha256');
  h.update(`${info.width}x${info.height}x${info.channels}\n`);
  h.update(data);
  return h.digest('hex');
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

if (!fs.existsSync(IMAGE_PATH)) {
  throw new Error(`${IMAGE_PATH} does not exist.`);
}

const currentHash = await pixelHash(IMAGE_PATH);
const previousHash = fs.existsSync(HASH_PATH)
  ? fs.readFileSync(HASH_PATH, 'utf8').trim()
  : '';

const changed = !previousHash || previousHash !== currentHash;

console.log(`Previous pixel hash: ${previousHash || '(none - first run)'}`);
console.log(`Current pixel hash:  ${currentHash}`);
console.log(changed ? 'Image changed.' : 'Image is unchanged.');

setOutput('changed', changed ? 'true' : 'false');
setOutput('hash', currentHash);

if (changed) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(HASH_PATH, `${currentHash}\n`);
}
