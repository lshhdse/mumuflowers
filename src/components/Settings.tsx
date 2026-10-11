import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import {
  Sparkles,
  RefreshCw,
  ChevronRight,
  Bell,
  Database,
  UserRound,
  Palette,
  ShieldCheck,
  Leaf,
  Download,
  Upload,
  Check,
  Info,
  ExternalLink,
  SlidersHorizontal,
  LayoutGrid,
  Sprout,
  CalendarDays,
  BookOpen,
} from 'lucide-react';
import { db, exportGarden, importGarden, removeDemo } from '../lib/db';
import { api, loadConnection, saveConnection } from '../lib/api';
import { enableNotifications, syncReminders, saveBackup } from '../lib/native';
import { checkUpdate, repository } from '../lib/updates';
import { defaultBottomMenus, menuOptions, normalizeBottomMenus } from '../lib/navigation';
import { PageHeading, SubHeading, Modal } from './ui';
import { UpdateAction } from './UpdateAction';
import { useResolvedTheme } from '../lib/appearance';
import version from '../version.json';
import type { Profile, Release } from '../types';

const menuIcons = {
  garden: LayoutGrid,
  plants: Sprout,
  care: CalendarDays,
  journal: BookOpen,
  my: UserRound,
};

type Props = {
  section: string;
  profile: Profile;
  setProfile: (p: Profile) => void;
  navigate: (path: string) => void;
  back: () => void;
  toast: (text: string) => void;
  run: (action: () => Promise<void>) => Promise<void>;
  busy: boolean;
};
export function Settings({
  section,
  profile,
  setProfile,
  navigate,
  back,
  toast,
  run,
  busy,
}: Props) {
  const plants = useLiveQuery(() => db.plants.toArray(), [], []);
  const [connection, setConnection] = useState(loadConnection);
  const [config, setConfig] = useState({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    apiKey: '',
    jsonMode: true,
  });
  const [hasKey, setHasKey] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [localProfile, setLocalProfile] = useState(profile);
  const resolvedTheme = useResolvedTheme(profile.theme);
  const rows = [
    {
      id: 'menus',
      icon: SlidersHorizontal,
      title: '菜单设置',
      subtitle: '选择底部显示的入口',
      color: 'green',
    },
    {
      id: 'profile',
      icon: UserRound,
      title: '个人与花园',
      subtitle: '给你的小花园起个名字',
      color: 'green',
    },
    {
      id: 'ai',
      icon: Sparkles,
      title: 'AI 配置',
      subtitle: '连接你的植物观察助手',
      color: 'purple',
    },
    {
      id: 'notifications',
      icon: Bell,
      title: '养护提醒',
      subtitle: '在合适的时候，温柔地提醒',
      color: 'amber',
    },
    {
      id: 'appearance',
      icon: Palette,
      title: '外观与动效',
      subtitle: '选择让你舒服的样子',
      color: 'pink',
    },
    {
      id: 'data',
      icon: Database,
      title: '数据与备份',
      subtitle: '把每一次生长好好收藏',
      color: 'blue',
    },
    {
      id: 'version',
      icon: RefreshCw,
      title: '版本更新',
      subtitle: `当前版本 ${version.version}`,
      color: 'green',
    },
    { id: 'about', icon: Info, title: '关于 MuMu', subtitle: '为热爱植物的人而生', color: 'gray' },
  ];
  if (!section)
    return (
      <>
        <PageHeading title="我的" />
        <div className="profile-card">
          <div className="profile-avatar">
            <FlowerAvatar />
          </div>
          <div>
            <h2>{profile.name}</h2>
            <p>{profile.gardenName}</p>
          </div>
          <div className="profile-count">
            <b>{plants.filter((p) => !p.demo).length}</b>
            <span>株植物，在你身边</span>
          </div>
        </div>
        <div className="settings-list">
          {rows.map((row) => (
            <button key={row.id} onClick={() => navigate(`/my/${row.id}`)}>
              <span className={`setting-icon ${row.color}`}>
                <row.icon size={21} />
              </span>
              <span>
                <b>{row.title}</b>
                <small>{row.subtitle}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </>
    );
  const titles: Record<string, string> = {
    menus: '菜单设置',
    profile: '个人与花园',
    ai: 'AI 配置',
    notifications: '养护提醒',
    appearance: '外观与动效',
    data: '数据与备份',
    version: '版本更新',
    about: '关于 MuMu',
  };
  return (
    <div className="settings-detail">
      <SubHeading title={titles[section] || '设置'} onBack={back} />
      {section === 'menus' && (
        <section className="settings-panel menu-settings">
          <div className="panel-intro">
            <SlidersHorizontal />
            <h2>留下你常用的入口</h2>
            <p>开启的菜单会显示在底部，修改后自动保存。花册和日记可按需开启。</p>
          </div>
          <div className="menu-preview" aria-label="底部菜单预览">
            {menuOptions
              .filter((menu) => profile.bottomMenus.includes(menu.id))
              .map((menu) => {
                const Icon = menuIcons[menu.id];
                return (
                  <span key={menu.id}>
                    <Icon size={20} />
                    <small>{menu.label}</small>
                  </span>
                );
              })}
          </div>
          <div className="menu-options">
            {menuOptions.map((menu) => {
              const Icon = menuIcons[menu.id];
              return (
                <label className="menu-option" key={menu.id}>
                  <span className="setting-icon green">
                    <Icon size={21} />
                  </span>
                  <span>
                    <b>{menu.title}</b>
                    <small>{menu.description}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`显示${menu.label}菜单`}
                    checked={profile.bottomMenus.includes(menu.id)}
                    disabled={menu.id === 'my'}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        bottomMenus: normalizeBottomMenus(
                          event.target.checked
                            ? [...profile.bottomMenus, menu.id]
                            : profile.bottomMenus.filter((id) => id !== menu.id),
                        ),
                      })
                    }
                  />
                </label>
              );
            })}
          </div>
          <button
            className="secondary-button"
            onClick={() => {
              setProfile({ ...profile, bottomMenus: [...defaultBottomMenus] });
              toast('已恢复花园、养护、我的三个入口');
            }}
          >
            恢复默认菜单
            <RefreshCw size={16} />
          </button>
        </section>
      )}
      {section === 'profile' && (
        <form
          className="settings-panel"
          onSubmit={(e) => {
            e.preventDefault();
            setProfile(localProfile);
            toast('小花园有了新的名字');
          }}
        >
          <div className="panel-intro">
            <UserRound />
            <h2>你好，花园主人</h2>
            <p>每一株植物，都有属于你的故事。</p>
          </div>
          <label>
            你的称呼
            <input
              required
              maxLength={30}
              value={localProfile.name}
              onChange={(e) => setLocalProfile({ ...localProfile, name: e.target.value })}
            />
          </label>
          <label>
            花园名称
            <input
              required
              maxLength={40}
              value={localProfile.gardenName}
              onChange={(e) => setLocalProfile({ ...localProfile, gardenName: e.target.value })}
            />
          </label>
          <button className="primary-button">
            保存信息
            <Check size={17} />
          </button>
        </form>
      )}
      {section === 'ai' && (
        <form
          className="settings-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              saveConnection(connection);
              const value = await api<{ hasKey: boolean }>('/settings', {
                method: 'PUT',
                body: JSON.stringify(config),
              });
              setHasKey(value.hasKey);
              setConfig({ ...config, apiKey: '' });
              setConfigLoaded(true);
              toast('AI 配置已保存，可以去分析植物了');
            });
          }}
        >
          <div className="panel-intro">
            <Sparkles />
            <h2>认识你的每一株植物</h2>
            <p>支持兼容 OpenAI 的视觉模型。提交照片后，后台继续分析，你可以自由离开页面。</p>
          </div>
          <label>
            后台服务地址
            <input
              type="url"
              placeholder={
                Capacitor.isNativePlatform()
                  ? 'https://flowers.example.com'
                  : '留空使用当前网页的后台'
              }
              value={connection.url}
              onChange={(e) => {
                setConnection({ ...connection, url: e.target.value });
                setConfigLoaded(false);
              }}
            />
            <small>安卓手机填写你部署的 HTTPS 后台地址。</small>
          </label>
          <label>
            服务访问令牌
            <input
              type="password"
              autoComplete="off"
              placeholder="后台生成的 MUMU_ACCESS_TOKEN"
              value={connection.token}
              onChange={(e) => {
                setConnection({ ...connection, token: e.target.value });
                setConfigLoaded(false);
              }}
            />
            <small>用于保护你的私人后台，与模型 API 密钥不同。</small>
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                saveConnection(connection);
                const data = await api<typeof config & { hasKey: boolean }>('/settings');
                setConfig({
                  baseUrl: data.baseUrl,
                  model: data.model,
                  jsonMode: data.jsonMode,
                  apiKey: '',
                });
                setHasKey(data.hasKey);
                setConfigLoaded(true);
                toast('已读取后台配置');
              })
            }
          >
            <RefreshCw size={16} />
            {configLoaded ? '重新读取配置' : '连接并读取配置'}
          </button>
          <div className="form-divider" />
          <label>
            模型 API 地址
            <input
              required
              type="url"
              value={config.baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            />
            <small>填写以 /v1 结尾的兼容接口基础地址。</small>
          </label>
          <label>
            视觉模型名称
            <input
              required
              maxLength={120}
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
            />
          </label>
          <label>
            模型 API 密钥
            <input
              type="password"
              autoComplete="new-password"
              value={config.apiKey}
              placeholder={hasKey ? '已安全保存，留空保留原密钥' : '输入你的 API Key'}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
          </label>
          <label className="switch-row">
            <span>
              JSON 输出模式<small>若平台不支持，请关闭后重试。</small>
            </span>
            <input
              type="checkbox"
              checked={config.jsonMode}
              onChange={(e) => setConfig({ ...config, jsonMode: e.target.checked })}
            />
          </label>
          <div className="info-note">
            <ShieldCheck size={18} />
            <span>
              API 密钥在后台加密保存。分析时照片会发送给你配置的模型服务；档案与日记留在本机。
            </span>
          </div>
          <div className="button-row">
            <button className="primary-button" disabled={busy}>
              保存配置
              <Check size={16} />
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  saveConnection(connection);
                  const data = await api<{ message: string }>('/settings/test', {
                    method: 'POST',
                    body: '{}',
                  });
                  toast(data.message);
                })
              }
            >
              测试连接
            </button>
          </div>
        </form>
      )}
      {section === 'notifications' && (
        <div className="settings-panel">
          <div className="panel-intro">
            <Bell />
            <h2>不忙的时候，也记得它们</h2>
            <p>提醒你先检查盆土，再决定是否浇水。</p>
          </div>
          <label className="switch-row">
            <span>
              系统养护通知<small>{profile.notifications ? '已开启' : '未开启'}</small>
            </span>
            <input
              type="checkbox"
              checked={profile.notifications}
              onChange={(e) => {
                const enabled = e.target.checked;
                void run(async () => {
                  if (enabled && !(await enableNotifications())) {
                    toast('请在系统设置中允许 MuMu Flowers 发送通知');
                    return;
                  }
                  const value = { ...profile, notifications: enabled };
                  await syncReminders(plants, value);
                  setProfile(value);
                  toast(enabled ? '养护通知已开启' : '养护通知已关闭');
                });
              }}
            />
          </label>
          <label>
            每天提醒时间
            <select
              value={profile.reminderHour}
              onChange={(e) => setProfile({ ...profile, reminderHour: Number(e.target.value) })}
            >
              {Array.from({ length: 16 }, (_, i) => i + 6).map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <div className="info-note">
            <Info size={18} />
            <span>
              {Capacitor.isNativePlatform()
                ? '安卓系统通知可以在应用关闭后提醒。澎湃 OS 的省电策略可能影响送达时间，请允许通知；提醒采用普通调度，时间可能略有延迟。最多安排最近 60 株植物。'
                : '浏览器预览只在页面打开时检查提醒。安卓安装包支持应用关闭后的系统通知。'}
            </span>
          </div>
          <p className="muted">示例植物不会发送系统通知。你可在每株植物的档案里调整检查周期。</p>
        </div>
      )}
      {section === 'appearance' && (
        <div className="settings-panel">
          <div className="panel-intro">
            <Palette />
            <h2>选择喜欢的明暗</h2>
            <p>柔和的磨砂玻璃，让小花园在日夜之间自在切换。</p>
          </div>
          <div className="theme-options" role="group" aria-label="外观模式">
            {(
              [
                { id: 'system', name: '跟随系统', desc: '自动切换' },
                { id: 'light', name: '浅色模式', desc: '温暖明亮' },
                { id: 'dark', name: '深色模式', desc: '安静深绿' },
              ] as const
            ).map((theme) => (
              <button
                className={profile.theme === theme.id ? 'selected' : ''}
                aria-pressed={profile.theme === theme.id}
                aria-label={theme.name}
                key={theme.id}
                onClick={() => setProfile({ ...profile, theme: theme.id })}
              >
                <div className={`theme-preview ${theme.id}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <b>{theme.name}</b>
                <small>{theme.desc}</small>
                {profile.theme === theme.id && <Check size={16} />}
              </button>
            ))}
          </div>
          <p className="appearance-status" role="status">
            {profile.theme === 'system' ? '已跟随系统' : '已手动选择'} · 当前为
            {resolvedTheme === 'dark' ? '深色' : '浅色'}模式
          </p>
          <div className="info-note">
            <Leaf size={18} />
            <span>界面遵循系统“减少动态效果”偏好；安卓设备支持轻触反馈。</span>
          </div>
        </div>
      )}
      {section === 'data' && (
        <div className="settings-panel">
          <div className="panel-intro">
            <Database />
            <h2>留住生长的痕迹</h2>
            <p>导出包含照片、植物档案与日记的完整备份。</p>
          </div>
          <div className="data-stats">
            <span>
              <b>{plants.length}</b> 份档案
            </span>
            <span>本机存储 · 可离线使用</span>
          </div>
          <button
            className="secondary-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const data = await exportGarden();
                await saveBackup(
                  data,
                  `mumu-flowers-${new Date().toISOString().slice(0, 10)}.json`,
                );
                toast('花园备份已导出');
              })
            }
          >
            <Download size={18} />
            导出花园备份
          </button>
          <button
            className="secondary-button full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={18} />
            导入花园备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setImportFile(file);
              e.target.value = '';
            }}
          />
          <div className="info-note">
            <ShieldCheck size={18} />
            <span>
              备份不包含任何密钥或访问令牌。清除应用数据或卸载前，请先导出备份。导入会合并档案，相同编号的内容由备份覆盖。
            </span>
          </div>
          {plants.some((p) => p.demo) && (
            <button className="text-button danger" onClick={() => setConfirmDemo(true)}>
              清除示例花园
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}
      {section === 'version' && (
        <div className="settings-panel version-panel">
          <img className="app-icon" src="/icon.svg" alt="MuMu Flowers 图标" />
          <h2>MuMu Flowers</h2>
          <span className="version-tag">Version {version.version}</span>
          <p>让每一次更新，都带来一点小美好。</p>
          <div className="release-notes">
            <span className="eyebrow">这次见面，有这些新鲜事</span>
            {version.notes.map((note) => (
              <p key={note}>
                <Check size={15} />
                {note}
              </p>
            ))}
          </div>
          <button
            className="primary-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const next = await checkUpdate();
                setRelease(next);
                setChecked(true);
                toast(next ? `发现新版本 ${next.version}` : '当前已是最新版本（或尚未发布新版）');
              })
            }
          >
            <RefreshCw size={17} />
            {busy ? '正在检查…' : '检查更新'}
          </button>
          {checked && !release && <p className="muted">已经是最新的你了。</p>}
          {release && (
            <div className="update-inline">
              <h3>新版本 {release.version}</h3>
              <pre>{release.notes}</pre>
              <UpdateAction key={release.version} release={release} />
            </div>
          )}
        </div>
      )}
      {section === 'about' && (
        <div className="settings-panel about-panel">
          <img className="app-icon" src="/icon.svg" alt="MuMu Flowers 图标" />
          <span className="eyebrow">A GARDEN OF YOUR OWN</span>
          <h2>花会开，日子也会。</h2>
          <p>MuMu Flowers 希望帮你记住每一次浇水、每一片新叶，以及和植物一起成长的日常。</p>
          <div className="info-note">
            <Leaf size={18} />
            <span>
              AI 观察是养护参考。照片无法可靠测得根区湿度、土壤 pH
              或养分；请结合实际检查确认。遇到无法确定的变化，多记录几张照片。
            </span>
          </div>
          <a
            className="secondary-button"
            href={`https://github.com/${repository}`}
            target="_blank"
            rel="noreferrer"
          >
            GitHub 项目
            <ExternalLink size={16} />
          </a>
          <p className="muted">示例照片来自 Unsplash，仅作界面展示。</p>
        </div>
      )}
      {confirmDemo && (
        <Modal title="清除示例花园" onClose={() => setConfirmDemo(false)}>
          <p>移除示例植物和示例记录，你自己添加的植物会保留。</p>
          <button
            className="primary-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await removeDemo();
                setConfirmDemo(false);
                toast('现在，这里是你的花园了');
              })
            }
          >
            清除示例
          </button>
        </Modal>
      )}
      {importFile && (
        <Modal title="导入花园备份" onClose={() => setImportFile(null)}>
          <p>
            即将导入「{importFile.name}
            」。相同编号的档案、照片和日记将由备份内容覆盖。建议先导出当前花园。
          </p>
          <button
            className="primary-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (importFile.size > 100 * 1024 * 1024) throw new Error('备份超过 100 MB');
                const count = await importGarden(await importFile.text());
                setImportFile(null);
                toast(`已导入 ${count} 份花卉档案`);
              })
            }
          >
            确认导入
          </button>
        </Modal>
      )}
    </div>
  );
}
function FlowerAvatar() {
  return <Leaf size={40} strokeWidth={1.2} />;
}
