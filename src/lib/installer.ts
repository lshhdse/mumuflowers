import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Release } from '../types';

export type DownloadState = {
  status:
    | 'idle'
    | 'downloading'
    | 'paused'
    | 'verifying'
    | 'ready'
    | 'failed'
    | 'permission'
    | 'installing';
  version?: string;
  received?: number;
  total?: number;
  message?: string;
};
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const UpdateInstaller = registerPlugin<{
  start(options: {
    version: string;
    url: string;
    size: number;
    sha256: string;
  }): Promise<DownloadState>;
  status(): Promise<DownloadState>;
  install(): Promise<DownloadState>;
  cancel(): Promise<DownloadState>;
  addListener(
    event: 'progress',
    listener: (state: DownloadState) => void,
  ): Promise<PluginListenerHandle>;
}>('UpdateInstaller');

export function installOptions(release: Release) {
  const expected = `https://github.com/lshhdse/mumuflowers/releases/download/v${release.version}/MuMu-Flowers-${release.version}.apk`;
  if (
    release.apkUrl !== expected ||
    !release.apkSha256?.match(/^[a-f0-9]{64}$/i) ||
    !release.apkSize ||
    !Number.isSafeInteger(release.apkSize) ||
    release.apkSize <= 0 ||
    release.apkSize > 100 * 1024 * 1024
  )
    throw new Error('安装包信息不完整，请重新检查更新');
  return {
    version: release.version,
    url: release.apkUrl,
    size: release.apkSize,
    sha256: release.apkSha256,
  };
}
