import version from '../version.json';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Release } from '../types';
export const repository = 'lshhdse/mumuflowers';
export function newerVersion(next: string, current = version.version) {
  const parse = (value: string) => {
    const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : null;
  };
  const n = parse(next),
    c = parse(current);
  if (!n || !c) return false;
  for (let i = 0; i < 3; i++) {
    if (n[i] > c[i]) return true;
    if (n[i] < c[i]) return false;
  }
  return false;
}
const safeUrl = (raw: string) => {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    !url.pathname.startsWith(`/${repository}/releases/`) ||
    url.username ||
    url.password
  )
    throw new Error('更新链接校验失败');
  return url.toString();
};
export function parseManifest(data: Release): Release | null {
  if (!newerVersion(data.version)) return null;
  if (
    !data.apkSha256?.match(/^[a-f0-9]{64}$/i) ||
    !Number.isSafeInteger(data.apkSize) ||
    !data.apkSize ||
    data.apkSize <= 0 ||
    data.apkSize > 100 * 1024 * 1024
  )
    throw new Error('更新安装包信息不完整');
  const expected = `https://github.com/${repository}/releases/download/v${data.version}/MuMu-Flowers-${data.version}.apk`;
  if (data.apkUrl !== expected) throw new Error('更新链接校验失败');
  return {
    ...data,
    url: safeUrl(data.url),
    notes: String(data.notes || '体验与稳定性更新').slice(0, 6000),
  };
}
export async function checkUpdate(): Promise<Release | null> {
  const native = Capacitor.getPlatform() === 'android';
  if (native) {
    // A small release asset avoids anonymous GitHub API quotas. Older releases fall back to the API.
    try {
      const manifest = await CapacitorHttp.get({
        url: `https://github.com/${repository}/releases/latest/download/update.json`,
        responseType: 'json',
        connectTimeout: 12000,
        readTimeout: 12000,
      });
      if (manifest.status === 200) return parseManifest(manifest.data);
    } catch {
      /* Network or legacy release: try the API below. */
    }
  }
  const options = {
    url: `https://api.github.com/repos/${repository}/releases/latest`,
    headers: { Accept: 'application/vnd.github+json' },
    responseType: 'json' as const,
    connectTimeout: 12000,
    readTimeout: 12000,
  };
  let response;
  try {
    response = native
      ? await CapacitorHttp.get(options)
      : await fetch(options.url, { headers: options.headers, signal: AbortSignal.timeout(12000) });
  } catch {
    throw new Error('无法检查更新，请确认网络连接后重试');
  }
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429)
    throw new Error('GitHub 检查额度暂时用完，请稍后重试');
  if (response.status < 200 || response.status >= 300)
    throw new Error('无法获取版本，请检查网络后重试');
  const data = 'data' in response ? response.data : await response.json();
  if (!newerVersion(data.tag_name)) return null;
  const apk = data.assets?.find((a: { name: string }) => a.name.endsWith('.apk'));
  return {
    version: data.tag_name.replace(/^v/, ''),
    notes: String(data.body || '体验与稳定性更新').slice(0, 6000),
    url: safeUrl(data.html_url),
    apkUrl: apk ? safeUrl(apk.browser_download_url) : null,
    apkSize: apk?.size,
    apkSha256: apk?.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1],
    publishedAt: data.published_at,
  };
}
