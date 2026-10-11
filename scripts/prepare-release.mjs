import { readFile, writeFile } from 'node:fs/promises';
const base = JSON.parse(await readFile('package.json', 'utf8')).version.split('.');
const build = Number(process.env.GITHUB_RUN_NUMBER || process.env.MUMU_BUILD_NUMBER || 1);
if (!Number.isInteger(build) || build < 1 || build > 2100000000)
  throw new Error('Invalid Android build number');
const version = `${base[0]}.${base[1]}.${build}`;
const notes = (await readFile('CHANGELOG.md', 'utf8'))
  .split('\n')
  .filter((line) => line.startsWith('- '))
  .slice(0, 15)
  .map((line) => line.slice(2));
await writeFile(
  'src/version.json',
  JSON.stringify(
    { version, build, releasedAt: new Date().toISOString().slice(0, 10), notes },
    null,
    2,
  ) + '\n',
);
const path = 'android/app/build.gradle';
let gradle = await readFile(path, 'utf8');
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${build}`)
  .replace(/versionName "[^"]+"/, `versionName "${version}"`);
await writeFile(path, gradle);
await writeFile(
  'release-notes.md',
  `MUMU Flowers v${version}\n\n${notes.map((n) => '- ' + n).join('\n')}\n\n下载 APK 后由安卓系统确认安装。相同签名的更新会保留花园数据。\n`,
);
console.log(`Prepared v${version} (Android build ${build})`);
