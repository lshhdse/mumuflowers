import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const version = JSON.parse(readFileSync('src/version.json', 'utf8'));
const commit = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) throw new Error('请先提交本次更新，再发布版本。');
if (commit !== git('rev-parse', 'origin/main')) throw new Error('请先推送本次提交到 GitHub main。');
if (!version.notes?.length) throw new Error('请先在 src/version.json 填写本次更新内容。');
const filename = `MuMu-Flowers-${version.version}.apk`;
const apk = readFileSync(`artifacts/${filename}`);
const digest = `sha256:${createHash('sha256').update(apk).digest('hex')}`;
const tag = `v${version.version}`;
const manifest = Buffer.from(
  JSON.stringify(
    {
      version: version.version,
      notes: version.notes.map((note) => `- ${note}`).join('\n'),
      url: `https://github.com/lshhdse/mumuflowers/releases/tag/${tag}`,
      apkUrl: `https://github.com/lshhdse/mumuflowers/releases/download/${tag}/${filename}`,
      apkSize: apk.length,
      apkSha256: digest.slice(7),
      publishedAt: version.releasedAt,
    },
    null,
    2,
  ) + '\n',
);
const credential = process.env.GITHUB_TOKEN
  ? null
  : execFileSync(
      'git',
      [
        '-c',
        'credential.interactive=false',
        '-c',
        'credential.guiPrompt=false',
        'credential',
        'fill',
      ],
      { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' },
    );
const token =
  process.env.GITHUB_TOKEN ||
  credential
    ?.split(/\r?\n/)
    .find((line) => line.startsWith('password='))
    ?.slice(9);
if (!token) throw new Error('未找到可用的 GitHub 发布凭据。');
const api = 'https://api.github.com/repos/lshhdse/mumuflowers';
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
};
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(Buffer.isBuffer(options.body) ? 90000 : 30000),
  });
  if (!response.ok) {
    let message = '';
    try {
      message = (await response.json()).message || '';
    } catch {}
    throw new Error(`GitHub ${response.status}: ${message}`);
  }
  return response.json();
}
const refreshNote = version.notes.some((note) => note.includes('120Hz'))
  ? '高刷新率由设备、系统设置和省电策略决定；已优化全局动画并请求最高 120Hz。\n\n'
  : '';
try {
  const releases = await request(`${api}/releases?per_page=30`);
  let release = releases.find((item) => item.tag_name === tag);
  if (!release) {
    release = await request(`${api}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: commit,
        name: `MuMu Flowers ${version.version}`,
        draft: true,
        prerelease: false,
        body: `${version.notes.map((note) => `- ${note}`).join('\n')}\n\n${refreshNote}下载下方 APK 覆盖安装即可保留花园照片、浇水记录和设置。1.0.4 起支持 App 内下载和调用安卓安装界面。较旧版本请先安装本次更新，之后的新版本可直接在 App 内下载安装。首次使用请按系统提示允许 MuMu Flowers 安装应用，仍需手动确认安装。`,
      }),
    });
    console.log(`已创建 ${tag} 发布草稿。`);
  }
  let asset = release.assets.find((item) => item.name === filename);
  if (!asset) {
    console.log(`正在上传 ${filename} (${apk.length} bytes)`);
    asset = await request(
      `${release.upload_url.replace(/\{.*$/, '')}?name=${encodeURIComponent(filename)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': String(apk.length),
        },
        body: apk,
      },
    );
  }
  if (
    asset.state !== 'uploaded' ||
    asset.size !== apk.length ||
    (asset.digest && asset.digest !== digest)
  )
    throw new Error('安装包大小或校验值不匹配，保留草稿以便检查。');
  let manifestAsset = release.assets.find((item) => item.name === 'update.json');
  if (!manifestAsset) {
    console.log('正在上传更新清单。');
    manifestAsset = await request(`${release.upload_url.replace(/\{.*$/, '')}?name=update.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(manifest.length) },
      body: manifest,
    });
  }
  const manifestDigest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`;
  if (
    manifestAsset.state !== 'uploaded' ||
    manifestAsset.size !== manifest.length ||
    (manifestAsset.digest && manifestAsset.digest !== manifestDigest)
  )
    throw new Error('更新清单校验未通过，保留草稿以便检查。');
  if (release.draft) {
    await request(`${api}/releases/${release.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: false, make_latest: 'true' }),
    });
  }
  const latest = await request(`${api}/releases/latest`);
  const finalAsset = latest.assets.find((item) => item.name === filename);
  const finalManifest = latest.assets.find((item) => item.name === 'update.json');
  if (
    latest.tag_name !== tag ||
    !finalAsset ||
    finalAsset.size !== apk.length ||
    !finalManifest ||
    finalManifest.size !== manifest.length
  )
    throw new Error('最新版本校验未通过，请重新运行以检查发布状态。');
  console.log(
    JSON.stringify({
      version: latest.tag_name,
      release: latest.html_url,
      download: finalAsset.browser_download_url,
      digest: finalAsset.digest ?? digest,
    }),
  );
} catch (error) {
  console.error(`发布未完成：${error.message}。重新运行会恢复同一版本的发布进度。`);
  process.exitCode = 1;
}
