import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const directory = '.tools/signing';
await mkdir(directory, { recursive: true });
const file = join(directory, 'mumu-release.jks');
try {
  await access(file);
  console.log('Existing MUMU signing key retained.');
  process.exit(0);
} catch {}
const password = randomBytes(32).toString('base64url');
const keytool = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool')
  : 'keytool';
const result = spawnSync(
  keytool,
  [
    '-genkeypair',
    '-keystore',
    file,
    '-alias',
    'mumu',
    '-keyalg',
    'RSA',
    '-keysize',
    '3072',
    '-validity',
    '10000',
    '-storetype',
    'JKS',
    '-storepass:env',
    'MUMU_SIGNING_PASSWORD',
    '-keypass:env',
    'MUMU_SIGNING_PASSWORD',
    '-dname',
    'CN=MUMU Flowers,OU=Personal Garden,O=MUMU,C=CN',
  ],
  { env: { ...process.env, MUMU_SIGNING_PASSWORD: password }, encoding: 'utf8' },
);
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(1);
}
await writeFile(
  join(directory, 'credentials.json'),
  JSON.stringify(
    { alias: 'mumu', storePassword: password, keyPassword: password, keystore: 'mumu-release.jks' },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  'Signing key created in .tools/signing. Back up this directory privately; never commit it.',
);
