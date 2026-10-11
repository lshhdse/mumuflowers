import version from '../version.json';
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
export async function checkUpdate(): Promise<Release | null> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429)
    throw new Error('GitHub 检查额度暂时用完，请稍后重试');
  if (!response.ok) throw new Error('无法获取版本，请检查网络后重试');
  const data = await response.json();
  if (!newerVersion(data.tag_name)) return null;
  const apk = data.assets?.find((a: { name: string }) => a.name.endsWith('.apk'));
  const safeUrl = (raw: string) => {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      !url.pathname.startsWith(`/${repository}/releases/`)
    )
      throw new Error('更新链接校验失败');
    return url.toString();
  };
  return {
    version: data.tag_name.replace(/^v/, ''),
    notes: String(data.body || '体验与稳定性更新').slice(0, 6000),
    url: safeUrl(data.html_url),
    apkUrl: apk ? safeUrl(apk.browser_download_url) : null,
    publishedAt: data.published_at,
  };
}
