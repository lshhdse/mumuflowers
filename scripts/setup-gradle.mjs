import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const version = '8.14.3';
const bases = [
  'https://downloads.gradle.org/distributions',
  'https://mirrors.huaweicloud.com/gradle',
];
await mkdir('.tools', { recursive: true });
let checksum;
for (const base of bases) {
  try {
    const r = await fetch(`${base}/gradle-${version}-bin.zip.sha256`, {
      signal: AbortSignal.timeout(12000),
    });
    if (r.ok) {
      const value = (await r.text()).trim().split(/\s/)[0];
      if (/^[a-f\d]{64}$/i.test(value)) {
        checksum = value;
        break;
      }
    }
  } catch {}
}
if (!checksum) throw new Error('Could not fetch Gradle SHA-256 checksum');
for (const base of bases) {
  try {
    console.log(`Downloading Gradle from ${new URL(base).hostname}`);
    const r = await fetch(`${base}/gradle-${version}-bin.zip`, {
      signal: AbortSignal.timeout(150000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = Buffer.from(await r.arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== checksum)
      throw new Error('Checksum mismatch');
    await writeFile('.tools/gradle.zip', data);
    console.log(`Verified Gradle: ${data.length} bytes`);
    process.exit(0);
  } catch (error) {
    console.log(error.message);
  }
}
throw new Error('Unable to download Gradle');
