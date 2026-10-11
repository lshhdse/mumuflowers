import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const filename = 'amazon-corretto-21-x64-windows-jdk.zip';
await mkdir('.tools', { recursive: true });
async function request(url, timeout) {
  let last;
  for (let n = 0; n < 4; n++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
const check = await request(`https://corretto.aws/downloads/latest_checksum/${filename}`, 20000);
if (!check.ok) throw new Error('Could not read JDK checksum');
const checksum = (await check.text()).trim().split(/\s/)[0];
const algorithm = /^[a-f\d]{64}$/i.test(checksum)
  ? 'sha256'
  : /^[a-f\d]{32}$/i.test(checksum)
    ? 'md5'
    : null;
if (!algorithm) throw new Error('Invalid JDK checksum');
console.log('Downloading Corretto JDK 21');
const response = await request(`https://corretto.aws/downloads/latest/${filename}`, 180000);
if (!response.ok) throw new Error(`JDK download HTTP ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (createHash(algorithm).update(data).digest('hex') !== checksum)
  throw new Error('JDK checksum mismatch');
await writeFile('.tools/jdk.zip', data);
console.log(`JDK verified: ${data.length} bytes`);
