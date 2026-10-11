import { afterEach, expect, test, vi } from 'vitest';
import { checkUpdate, parseManifest } from './updates';
import { installOptions } from './installer';
import type { Release } from '../types';

const release: Release = {
  version: '9.0.0',
  notes: '开屏与应用内更新',
  publishedAt: '2026-10-11',
  url: 'https://github.com/lshhdse/mumuflowers/releases/tag/v9.0.0',
  apkUrl: 'https://github.com/lshhdse/mumuflowers/releases/download/v9.0.0/MuMu-Flowers-9.0.0.apk',
  apkSize: 8000000,
  apkSha256: 'a'.repeat(64),
};
afterEach(() => vi.unstubAllGlobals());

test('release manifests supply the exact APK and verification data; current versions are ignored', () => {
  expect(parseManifest(release)).toEqual(release);
  expect(installOptions(release)).toEqual({
    version: '9.0.0',
    url: release.apkUrl,
    size: 8000000,
    sha256: 'a'.repeat(64),
  });
  expect(parseManifest({ ...release, version: '1.0.0' })).toBeNull();
});
test('foreign, altered or unverifiable APK metadata cannot be sent to the Android installer', () => {
  for (const invalid of [
    { ...release, apkUrl: release.apkUrl!.replace('lshhdse', 'someone') },
    { ...release, apkUrl: release.apkUrl! + '?file=other' },
    { ...release, apkSha256: 'invalid' },
    { ...release, apkSize: -1 },
    { ...release, apkSize: 101 * 1024 * 1024 },
    { ...release, apkSize: 1.5 },
    { ...release, apkSha256: undefined },
  ]) {
    expect(() => parseManifest(invalid)).toThrow();
    expect(() => installOptions(invalid)).toThrow();
  }
});
test('legacy API releases retain APK size and hash without substituting a release page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v9.0.0',
          html_url: release.url,
          body: release.notes,
          published_at: release.publishedAt,
          assets: [
            {
              name: 'MuMu-Flowers-9.0.0.apk',
              browser_download_url: release.apkUrl,
              size: release.apkSize,
              digest: `sha256:${release.apkSha256}`,
            },
          ],
        }),
      ),
    ),
  );
  expect(await checkUpdate()).toEqual(release);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v9.0.0',
          html_url: release.url,
          assets: [],
        }),
      ),
    ),
  );
  expect((await checkUpdate())?.apkUrl).toBeNull();
});
