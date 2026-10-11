import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { UpdateInstaller, installOptions, isAndroid, type DownloadState } from '../lib/installer';
import type { Release } from '../types';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
export function UpdateAction({ release, later }: { release: Release; later?: () => void }) {
  const android = isAndroid();
  const [download, setDownload] = useState<DownloadState>({ status: 'idle' });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const autoInstall = useRef(false);
  const installing = useRef(false);
  const mounted = useRef(false);
  const version = release.version;

  async function install() {
    if (installing.current || !mounted.current) return;
    installing.current = true;
    autoInstall.current = false;
    setWorking(true);
    setMessage('首次安装请允许此来源，然后在系统界面确认更新。');
    try {
      const result = await UpdateInstaller.install();
      if (mounted.current) setMessage(result.message || '安装包已就绪，请在系统安装界面确认。');
    } catch (error) {
      if (mounted.current) setMessage(messageOf(error));
    } finally {
      installing.current = false;
      if (mounted.current) setWorking(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (!android)
      return () => {
        mounted.current = false;
      };
    let reading = false;
    const receive = (state: DownloadState) => {
      if (!mounted.current) return;
      if (state.version !== version) return setDownload({ status: 'idle' });
      setDownload(state);
      if (state.status === 'ready' && autoInstall.current && document.visibilityState === 'visible')
        void install();
    };
    const read = async () => {
      if (reading || document.visibilityState !== 'visible') return;
      reading = true;
      try {
        receive(await UpdateInstaller.status());
      } catch (error) {
        if (mounted.current) setMessage(messageOf(error));
      } finally {
        reading = false;
      }
    };
    const listener = UpdateInstaller.addListener('progress', receive).catch(() => null);
    void read();
    const timer = window.setInterval(() => void read(), 1200);
    document.addEventListener('visibilitychange', read);
    return () => {
      mounted.current = false;
      autoInstall.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', read);
      void listener.then((handle) => handle?.remove());
    };
    // Each release has its own action; native state survives closing the dialog or restarting the app.
  }, [android, version]);

  async function begin() {
    setWorking(true);
    setMessage('');
    try {
      const state = await UpdateInstaller.start(installOptions(release));
      if (!mounted.current) return;
      setDownload(state);
      autoInstall.current = true;
      if (state.status === 'ready') await install();
    } catch (error) {
      autoInstall.current = false;
      if (mounted.current) {
        setDownload({ status: 'failed', version });
        setMessage(messageOf(error));
      }
    } finally {
      if (mounted.current) setWorking(false);
    }
  }
  async function cancel() {
    autoInstall.current = false;
    setWorking(true);
    try {
      setDownload(await UpdateInstaller.cancel());
      setMessage('下载已取消');
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setWorking(false);
    }
  }

  const active = ['downloading', 'paused', 'verifying'].includes(download.status);
  const ready = download.status === 'ready';
  const total = download.total || release.apkSize || 0;
  const percent = total ? Math.min(100, Math.round(((download.received || 0) / total) * 100)) : 0;
  const progressLabel =
    download.status === 'verifying'
      ? '正在校验安装包…'
      : download.status === 'paused'
        ? '等待网络恢复…'
        : `正在下载 ${percent}%`;
  return (
    <div className="update-action">
      {android && active && (
        <div className="update-progress" role="status" aria-live="polite">
          <div>
            <span>{progressLabel}</span>
            <small>
              {total
                ? `${((download.received || 0) / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`
                : '准备下载…'}
            </small>
          </div>
          <progress aria-label="更新安装包下载进度" max={100} value={percent} />
        </div>
      )}
      <div className="button-row">
        {android ? (
          <button
            className="primary-button"
            disabled={working || active || !release.apkUrl}
            onClick={() => void (ready ? install() : begin())}
          >
            {ready ? (
              <ShieldCheck size={17} />
            ) : download.status === 'failed' ? (
              <RefreshCw size={17} />
            ) : (
              <Download size={17} />
            )}
            {working
              ? '正在准备…'
              : ready
                ? '安装更新'
                : active
                  ? progressLabel
                  : download.status === 'failed'
                    ? '重新下载'
                    : '立即更新'}
          </button>
        ) : release.apkUrl ? (
          <a
            className="primary-button"
            href={release.apkUrl}
            target="_blank"
            rel="noreferrer"
            download
          >
            <Download size={17} />
            下载安卓安装包
          </a>
        ) : (
          <button className="primary-button" disabled>
            安装包尚未就绪
          </button>
        )}
        {android && active && (
          <button className="secondary-button" disabled={working} onClick={() => void cancel()}>
            取消下载
          </button>
        )}
        {later && (
          <button className="secondary-button" onClick={later}>
            稍后更新
          </button>
        )}
      </div>
      {(message || download.message) && (
        <p className="update-message" role="status">
          {message || download.message}
        </p>
      )}
      <p className="muted update-hint">
        {android
          ? active
            ? '可以继续照顾花园，下载会在后台进行。'
            : '在 App 内下载安装包，由安卓系统确认安装，花园记录会保留。'
          : '将安装包发送到安卓手机，覆盖安装可保留花园记录。'}
      </p>
    </div>
  );
}
