import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  LayoutGrid,
  Leaf,
  Sprout,
  CalendarDays,
  BookOpen,
  UserRound,
  Plus,
  Camera,
  Search,
  Bell,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  Droplets,
  Sparkles,
  Heart,
  MapPin,
  ImagePlus,
  X,
  LoaderCircle,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Pencil,
  Trash2,
  CheckCheck,
} from 'lucide-react';
import {
  db,
  initializeGarden,
  createPlant,
  addPhoto,
  deletePlant,
  recordCare,
  recordWatering,
  updateWateringPlan,
  removeDemo,
  loadProfile,
  saveProfile,
  day,
} from './lib/db';
import { loadConnection, submitAnalysis, pollJobs, retryJob, api } from './lib/api';
import { compressPhoto, nativePhoto, haptic, syncReminders } from './lib/native';
import { checkUpdate } from './lib/updates';
import {
  PageHeading,
  SectionTitle,
  SubHeading,
  PlantGrid,
  Empty,
  Modal,
  moistureLabels,
  entryLabels,
  jobLabels,
  dateLabel,
} from './components/ui';
import { Settings } from './components/Settings';
import { PlantDetail } from './components/PlantDetail';
import { StartupScreen } from './components/StartupScreen';
import { UpdateAction } from './components/UpdateAction';
import {
  addCalendarDays,
  nextCareAt,
  wateredToday,
  waterReminderAt,
  wateringDue,
  wateringLabel,
} from './lib/watering';
import { menuOptions } from './lib/navigation';
import type { Plant, Profile, Release, Entry, Moisture } from './types';

type ModalName =
  | 'new'
  | 'photo'
  | 'note'
  | 'check'
  | 'water'
  | 'water-done'
  | 'water-plan'
  | 'edit'
  | 'delete'
  | 'plan'
  | 'start'
  | null;
const routeIcons = {
  garden: LayoutGrid,
  plants: Sprout,
  care: CalendarDays,
  journal: BookOpen,
  my: UserRound,
};
const routes = menuOptions.map((menu) => ({
  ...menu,
  short: menu.label,
  label: menu.title,
  icon: routeIcons[menu.id],
}));
const pathNow = () => window.location.hash.replace(/^#/, '') || `/${loadProfile().bottomMenus[0]}`;
const startOfDay = (v: number) => {
  const date = new Date(v);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export default function App() {
  const [, tickClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tickClock((value) => value + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const [ready, setReady] = useState(false),
    [initError, setInitError] = useState('');
  const [path, setPath] = useState(pathNow),
    [direction, setDirection] = useState(1);
  const navStack = useRef([pathNow()]);
  const [profile, setProfileState] = useState(loadProfile);
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [modal, setModal] = useState<ModalName>(null),
    [targetId, setTargetId] = useState('');
  const [newImage, setNewImage] = useState(''),
    [photoKind, setPhotoKind] = useState<'plant' | 'soil'>('plant');
  const [form, setForm] = useState({ name: '', location: '阳台', notes: '', intervalDays: 7 });
  const [autoAI, setAutoAI] = useState(true),
    [note, setNote] = useState(''),
    [noteType, setNoteType] = useState<Entry['type']>('note');
  const [moisture, setMoisture] = useState<Moisture>('unknown');
  const [wateringDays, setWateringDays] = useState(7);
  const [waterResult, setWaterResult] = useState<{ plant: Plant; alreadyRecorded: boolean } | null>(
    null,
  );
  const [search, setSearch] = useState(''),
    [location, setLocation] = useState('全部'),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  const [careTab, setCareTab] = useState<'today' | 'all' | 'queue'>('today'),
    [selectedDate, setSelectedDate] = useState(startOfDay(Date.now()));
  const [release, setRelease] = useState<Release | null>(null),
    [lightbox, setLightbox] = useState('');
  const photoInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const plants = useLiveQuery(() => db.plants.orderBy('createdAt').reverse().toArray(), [], []);
  const entries = useLiveQuery(() => db.entries.orderBy('createdAt').reverse().toArray(), [], []);
  const photos = useLiveQuery(() => db.photos.orderBy('createdAt').reverse().toArray(), [], []);
  const jobs = useLiveQuery(() => db.jobs.orderBy('createdAt').reverse().toArray(), [], []);
  const currentPlant = plants.find((p) => p.id === path.split('/')[2]);
  const target = plants.find((p) => p.id === targetId) || currentPlant;
  const active = path.split('/')[1];
  const isSubpage = path.split('/').filter(Boolean).length > 1;
  const visibleMenus = routes.filter((route) => profile.bottomMenus.includes(route.id));
  const liveJobs = jobs.filter((j) => ['submitting', 'queued', 'running'].includes(j.status));
  const today = startOfDay(Date.now());
  const due = plants.filter((p) => startOfDay(nextCareAt(p)) <= today);
  const realPlants = plants.filter((p) => !p.demo);
  const allDemo = plants.length > 0 && !realPlants.length;
  const searched = useMemo(
    () =>
      plants.filter((plant) =>
        `${plant.name} ${plant.species} ${plant.location}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [plants, search],
  );
  const filtered = useMemo(
    () =>
      searched.filter(
        (p) => (location === '全部' || p.location === location) && (!favoritesOnly || p.favorite),
      ),
    [searched, location, favoritesOnly],
  );
  const navigate = useCallback((next: string) => {
    if (next !== pathNow()) {
      setDirection(1);
      window.location.hash = next;
    }
  }, []);
  const back = useCallback(() => {
    if (navStack.current.length > 1) {
      setDirection(-1);
      navStack.current.pop();
      window.history.back();
    } else navigate(pathNow().startsWith('/my/') ? '/my' : '/garden');
  }, [navigate]);
  const toast = useCallback((text: string) => {
    setToastText(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(''), 4800);
  }, []);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await action();
      } catch (error) {
        if (error instanceof Error && /cancel|canceled|取消|abort/i.test(error.message)) return;
        toast(error instanceof Error ? error.message : '操作未完成，请重试');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toast],
  );
  const setProfile = useCallback((value: Profile) => {
    saveProfile(value);
    setProfileState(value);
  }, []);
  const newPlant = () => {
    setTargetId('');
    setNewImage('');
    setForm({ name: '', location: '阳台', notes: '', intervalDays: 7 });
    setAutoAI(true);
    setModal('new');
    void haptic();
  };
  const openModal = useCallback(
    (name: ModalName, plant?: Plant) => {
      setTargetId(plant?.id || currentPlant?.id || '');
      setNote('');
      setNoteType('note');
      setMoisture(plant?.moisture || currentPlant?.moisture || 'unknown');
      setNewImage('');
      setPhotoKind('plant');
      if ((name === 'water' || name === 'water-plan') && (plant || currentPlant)) {
        setWateringDays((plant || currentPlant!).wateringIntervalDays);
        setWaterResult(null);
      }
      if (name === 'edit' && (plant || currentPlant)) {
        const p = plant || currentPlant!;
        setForm({
          name: p.name,
          location: p.location,
          notes: p.notes,
          intervalDays: p.intervalDays,
        });
      }
      setModal(name);
      void haptic();
    },
    [currentPlant],
  );
  const openPlant = useCallback((plant: Plant) => navigate(`/plant/${plant.id}`), [navigate]);
  const waterPlant = useCallback((plant: Plant) => openModal('water', plant), [openModal]);
  const startAI = (plant: Plant) => {
    void run(async () => {
      const job = await submitAnalysis(plant);
      toast(
        ['queued', 'running'].includes(job.status)
          ? 'AI 已在后台观察，你可以继续逛逛花园'
          : '分析已提交',
      );
    });
  };
  const choosePhoto = (source: 'camera' | 'gallery') => {
    if (Capacitor.isNativePlatform())
      void run(async () => {
        const image = await nativePhoto(source);
        if (image) setNewImage(image);
      });
    else (source === 'camera' ? cameraInput : photoInput).current?.click();
  };
  const receivePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void run(async () => setNewImage(await compressPhoto(file)));
    e.target.value = '';
  };

  useEffect(() => {
    void initializeGarden()
      .then(() => setReady(true))
      .catch(() => setInitError('无法打开本机存储，请允许此应用保存数据后重试。'));
  }, []);
  useEffect(() => {
    const handler = () => {
      const next = pathNow();
      if (navStack.current.at(-1) !== next) navStack.current.push(next);
      setPath(next);
      setSearch('');
      setLocation('全部');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        profile.theme === 'system' ? (media.matches ? 'dark' : 'light') : profile.theme);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [profile.theme]);
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== 'hidden')
        void pollJobs((name) => toast(`${name} 的 AI 观察已完成`));
    };
    const timer = setInterval(poll, 5000);
    poll();
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [toast]);
  useEffect(() => {
    if (ready) void syncReminders(plants, profile).catch(() => {});
  }, [plants, profile.notifications, profile.reminderHour, ready]);
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let pending = false;
    let lastCheck = 0;
    const inspect = () => {
      if (pending || document.visibilityState === 'hidden' || Date.now() - lastCheck < 5 * 60000)
        return;
      pending = true;
      lastCheck = Date.now();
      void checkUpdate()
        .then((next) => {
          if (!disposed && next && sessionStorage.getItem('mumu-update-later') !== next.version)
            setRelease(next);
        })
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    };
    inspect();
    const timer = setInterval(inspect, 5 * 60000);
    document.addEventListener('visibilitychange', inspect);
    const nativeHandle = Capacitor.isNativePlatform()
      ? NativeApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) inspect();
        })
      : null;
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', inspect);
      void nativeHandle?.then((handle) => handle.remove());
    };
  }, [ready]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const backHandle = NativeApp.addListener('backButton', () => {
        if (modal || lightbox || release)
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        else if (isSubpage) back();
        else void NativeApp.minimizeApp();
      });
      const notifyHandle = LocalNotifications.addListener(
        'localNotificationActionPerformed',
        async (event) => {
          const id = event.notification.extra?.plantId;
          if (typeof id !== 'string') return;
          const plant = await db.plants.get(id);
          if (!plant) return;
          navigate(`/plant/${id}`);
          if (event.notification.extra?.kind === 'water') {
            setTargetId(id);
            setWateringDays(plant.wateringIntervalDays);
            setWaterResult(null);
            setModal('water');
          }
        },
      );
      return () => {
        void backHandle.then((h) => h.remove());
        void notifyHandle.then((h) => h.remove());
      };
    }
  }, [modal, lightbox, release, isSubpage, back, navigate]);
  useEffect(() => {
    if (
      Capacitor.isNativePlatform() ||
      !profile.notifications ||
      !('Notification' in window) ||
      Notification.permission !== 'granted'
    )
      return;
    for (const plant of due.filter((p) => !p.demo)) {
      const waterDue = wateringDue(plant);
      const key = `mumu-notified-${plant.id}-${nextCareAt(plant)}`;
      if (!sessionStorage.getItem(key)) {
        const notification = new Notification(
          waterDue ? `${plant.name} 到了建议浇水日期` : `${plant.name} 想见见你`,
          {
            body: waterDue
              ? '确认盆土需要水后浇水，点击进入浇水打卡。'
              : '检查一下盆土，再决定是否需要浇水。',
            icon: '/icon.svg',
            tag: plant.id,
          },
        );
        notification.onclick = () => {
          window.focus();
          navigate(`/plant/${plant.id}`);
          if (waterDue) {
            setTargetId(plant.id);
            setWateringDays(plant.wateringIntervalDays);
            setWaterResult(null);
            setModal('water');
          }
        };
        sessionStorage.setItem(key, 'true');
      }
    }
  }, [plants, profile.notifications, today, navigate]);

  if (initError)
    return (
      <StartupScreen>
        <p>{initError}</p>
        <button className="primary-button" onClick={() => window.location.reload()}>
          重新尝试
        </button>
      </StartupScreen>
    );
  if (!ready) return <StartupScreen />;
  const weekStart = startOfDay(Date.now()) - ((new Date().getDay() + 6) % 7) * day;
  const upcoming = [...plants].sort((a, b) => nextCareAt(a) - nextCareAt(b));
  const carePlants =
    careTab === 'all'
      ? upcoming
      : plants.filter((p) =>
          selectedDate === today
            ? startOfDay(nextCareAt(p)) <= selectedDate
            : startOfDay(p.nextCheckAt) === selectedDate ||
              startOfDay(waterReminderAt(p)) === selectedDate,
        );

  function savePlantForm(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!form.name.trim() || !form.location.trim()) throw new Error('请填写植物名字和位置');
      if (!newImage) throw new Error('先添加一张植物照片吧');
      const plant = await createPlant(
        { ...form, name: form.name.trim(), location: form.location.trim() },
        newImage,
      );
      setModal(null);
      navigate(`/plant/${plant.id}`);
      toast('新朋友已经住进花园');
      if (autoAI && loadConnection().token)
        void submitAnalysis(plant)
          .then(() => toast('AI 识别已在后台开始'))
          .catch((error) => toast(error.message));
      else if (autoAI) toast('档案已创建。进入「我的 → AI 配置」后，即可识别植物');
    });
  }
  const renderEntry = (entry: Entry) => {
    const p = plants.find((p) => p.id === entry.plantId);
    const Icon =
      entry.type === 'water'
        ? Droplets
        : entry.type === 'analysis'
          ? Sparkles
          : entry.type === 'photo'
            ? Camera
            : entry.type === 'prune'
              ? Scissors
              : entry.type === 'fertilize'
                ? Sprout
                : BookOpen;
    return (
      <button
        className="journal-entry"
        key={entry.id}
        onClick={() => p && navigate(`/plant/${p.id}`)}
      >
        <span className={`journal-entry-icon ${entry.type}`}>
          <Icon size={18} />
        </span>
        <div>
          <small>
            {p?.name || '花园记录'}
            <span>{entryLabels[entry.type]}</span>
          </small>
          <p>{entry.text}</p>
          <time>
            {dateLabel(entry.createdAt)}
            {entry.demo && ' · 示例记录'}
          </time>
        </div>
        {p && <img src={p.cover} alt="" />}
      </button>
    );
  };

  return (
    <div className="app-shell">
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>MuMu Flowers</span>
            <ChevronRight size={13} />
            <b>
              {active === 'plant'
                ? '植物档案'
                : routes.find((r) => r.id === active)?.label || '我的花园'}
            </b>
          </div>
          <div className="topbar-right">
            <span className="today-date">
              {new Date().toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="养护通知与 AI 任务"
              onClick={() => {
                setCareTab(liveJobs.length ? 'queue' : 'today');
                navigate('/care');
              }}
            >
              <Bell size={19} />
              {(due.length > 0 || liveJobs.length > 0) && <i />}
            </button>
            <button className="mini-avatar" aria-label="我的设置" onClick={() => navigate('/my')}>
              {profile.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={path}
              className="page"
              initial={
                reduceMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 0,
                      x: isSubpage ? 25 * direction : 0,
                      y: isSubpage ? 0 : 8,
                    }
              }
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={
                reduceMotion ? { opacity: 1 } : { opacity: 0, x: isSubpage ? -10 * direction : 0 }
              }
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {active === 'garden' && (
                <div className="garden-page">
                  <PageHeading
                    title={profile.gardenName}
                    description={`${plants.length} 株植物，慢慢生长`}
                  >
                    <button className="primary-button" onClick={newPlant}>
                      <Plus size={18} />
                      添加植物
                    </button>
                  </PageHeading>
                  {allDemo && (
                    <div className="demo-banner">
                      <Leaf size={14} />
                      <span>示例花园</span>
                      <button onClick={() => setModal('start')}>
                        换成我的植物
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  {due.length > 0 && (
                    <button
                      className="garden-care-summary"
                      onClick={() => {
                        setSelectedDate(today);
                        setCareTab('today');
                        navigate('/care');
                      }}
                    >
                      <span className="setting-icon green">
                        <Droplets size={20} />
                      </span>
                      <span>
                        <b>{due.length} 株植物待养护</b>
                        <small>看看盆土，再决定是否浇水</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  )}
                  <div className="search-field garden-search">
                    <Search size={18} />
                    <input
                      aria-label="搜索植物"
                      placeholder="搜索植物名称或位置"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-button"
                        aria-label="清空搜索"
                        onClick={() => setSearch('')}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  {plants.length ? (
                    searched.length ? (
                      <PlantGrid
                        className="plant-grid garden-grid"
                        plants={searched}
                        busy={busy}
                        onOpen={openPlant}
                        onWater={waterPlant}
                      />
                    ) : (
                      <Empty title="没有找到这株植物" text="换个名称或位置再找找。" />
                    )
                  ) : (
                    <Empty title="添加你的第一株植物" text="拍一张照片，开始记录它的生长。">
                      <button className="primary-button" onClick={newPlant}>
                        <Plus size={17} />
                        添加第一株植物
                      </button>
                    </Empty>
                  )}
                </div>
              )}
              {active === 'plants' && (
                <>
                  <PageHeading
                    eyebrow="EVERY LEAF HAS A STORY"
                    title="植物花册"
                    description="每一位绿色朋友，都有自己的生长故事。"
                  >
                    <button className="primary-button" onClick={newPlant}>
                      <Plus size={18} />
                      添加植物
                    </button>
                  </PageHeading>
                  <div className="collection-toolbar">
                    <div className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="搜索植物"
                        placeholder="找一找你的植物…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          className="icon-button"
                          aria-label="清空搜索"
                          onClick={() => setSearch('')}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <button
                      className={`filter-favorite ${favoritesOnly ? 'selected' : ''}`}
                      onClick={() => setFavoritesOnly(!favoritesOnly)}
                    >
                      <Heart size={17} fill={favoritesOnly ? 'currentColor' : 'none'} />
                      我的偏爱
                    </button>
                  </div>
                  <div className="location-tabs">
                    {['全部', ...new Set(plants.map((p) => p.location))].map((loc) => (
                      <button
                        className={location === loc ? 'active' : ''}
                        key={loc}
                        onClick={() => setLocation(loc)}
                      >
                        {loc}
                        {loc === '全部' && <span>{plants.length}</span>}
                      </button>
                    ))}
                  </div>
                  {filtered.length ? (
                    <PlantGrid
                      className="plant-grid collection-grid"
                      plants={filtered}
                      busy={busy}
                      onOpen={openPlant}
                      onWater={waterPlant}
                    />
                  ) : (
                    <Empty
                      title={plants.length ? '没有找到这位绿色朋友' : '你的花园，从这里开始'}
                      text={
                        plants.length
                          ? '换个名字或位置，再找找看。'
                          : '拍照添加植物，记录每一次生长。'
                      }
                    >
                      <button className="primary-button" onClick={newPlant}>
                        <Plus size={17} />
                        添加植物
                      </button>
                    </Empty>
                  )}
                </>
              )}
              {active === 'care' && (
                <>
                  <PageHeading
                    eyebrow="A LITTLE CARE EVERY DAY"
                    title="养护提醒"
                    description="照顾它们，也把生活的节奏找回来。"
                  />
                  <div className="segmented-control">
                    {(
                      [
                        { id: 'today', label: '每日计划' },
                        { id: 'all', label: '所有待办' },
                        {
                          id: 'queue',
                          label: `AI 任务${liveJobs.length ? ` · ${liveJobs.length}` : ''}`,
                        },
                      ] as const
                    ).map((tab) => (
                      <button
                        className={careTab === tab.id ? 'active' : ''}
                        key={tab.id}
                        onClick={() => setCareTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {careTab === 'today' && (
                    <section className="care-calendar card">
                      <div>
                        <b>
                          {new Date(selectedDate).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'long',
                          })}
                        </b>
                        <span>小事也值得被记住</span>
                      </div>
                      <div className="week-strip large">
                        {Array.from({ length: 7 }, (_, i) => {
                          const at = weekStart + i * day;
                          return (
                            <button
                              key={i}
                              className={at === selectedDate ? 'today' : ''}
                              onClick={() => setSelectedDate(at)}
                            >
                              <small>星期{['一', '二', '三', '四', '五', '六', '日'][i]}</small>
                              <b>{new Date(at).getDate()}</b>
                              {plants.some(
                                (p) =>
                                  startOfDay(p.nextCheckAt) === at ||
                                  startOfDay(waterReminderAt(p)) === at,
                              ) && <i />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {careTab !== 'queue' ? (
                    <>
                      <SectionTitle
                        title={
                          careTab === 'all'
                            ? '接下来的小事'
                            : selectedDate === today
                              ? '今天的养护清单'
                              : `${dateLabel(selectedDate)}的计划`
                        }
                        note={`${carePlants.length} 件`}
                      />
                      <div className="care-list">
                        {carePlants.map((p) => (
                          <div className="care-row card" key={p.id}>
                            <img src={p.cover} alt={p.name} />
                            <div>
                              <span className="eyebrow">
                                {p.location}
                                {p.demo ? ' · 示例' : ''}
                              </span>
                              <button
                                className="care-name"
                                onClick={() => navigate(`/plant/${p.id}`)}
                              >
                                {p.name}
                                <ChevronRight size={16} />
                              </button>
                              <p>
                                <Droplets size={14} />
                                {wateringLabel(waterReminderAt(p))}
                                <span>每 {p.wateringIntervalDays} 天</span>
                              </p>
                            </div>
                            <div className="care-row-actions">
                              <button
                                className="primary-button"
                                disabled={busy || wateredToday(p)}
                                onClick={() => openModal('water', p)}
                              >
                                <Droplets size={16} />
                                {wateredToday(p) ? '今天已打卡' : '浇水打卡'}
                              </button>
                              <button
                                className="secondary-button"
                                disabled={busy}
                                onClick={() => openModal('check', p)}
                              >
                                <Check size={16} />
                                记录检查
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {!carePlants.length && (
                        <Empty
                          title="今天可以慢一点"
                          text="没有待养护的植物，去看看它们的新叶吧。"
                        />
                      )}
                      <div className="info-note care-note">
                        <ShieldCheck size={18} />
                        <span>
                          浇水打卡后，按每株植物的间隔安排下一次建议。盆土仍湿润时可以记录检查，稍后再提醒。
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="info-note">
                        <Sparkles size={18} />
                        <span>
                          AI
                          由独立后台服务处理；离开此页面后继续分析。重新打开应用时自动领取结果。照片任务在后台保留
                          30 天。
                        </span>
                      </div>
                      <div className="job-list">
                        {jobs.map((job) => {
                          const plant = plants.find((p) => p.id === job.plantId);
                          return (
                            <div className="job-row card" key={job.id}>
                              <div className={`job-icon ${job.status}`}>
                                {['running', 'queued', 'submitting'].includes(job.status) ? (
                                  <LoaderCircle className="spin" size={21} />
                                ) : job.status === 'done' ? (
                                  <Check size={21} />
                                ) : (
                                  <Sparkles size={21} />
                                )}
                              </div>
                              <div>
                                <b>{plant?.name || '植物分析'}</b>
                                <span className={`job-status ${job.status}`}>
                                  {jobLabels[job.status]}
                                </span>
                                <small>
                                  {dateLabel(job.createdAt)}
                                  {job.error && ` · ${job.error}`}
                                </small>
                              </div>
                              {job.status === 'failed' ? (
                                <button
                                  className="secondary-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await retryJob(job);
                                      toast('已重新提交后台分析');
                                    })
                                  }
                                >
                                  <RefreshCw size={15} />
                                  重试
                                </button>
                              ) : job.status === 'done' ? (
                                <button
                                  className="text-button"
                                  onClick={() => navigate(`/plant/${job.plantId}`)}
                                >
                                  查看
                                  <ChevronRight size={15} />
                                </button>
                              ) : ['queued', 'running'].includes(job.status) ? (
                                <button
                                  className="text-button muted"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await api(`/jobs/${job.id}`, { method: 'DELETE' });
                                      await db.jobs.update(job.id, { status: 'cancelled' });
                                      toast('分析任务已取消');
                                    })
                                  }
                                >
                                  取消
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {!jobs.length && (
                        <Empty
                          title="还没有 AI 观察任务"
                          text="打开一株植物的档案，点「AI 分析」开始认识它。"
                        >
                          <button className="primary-button" onClick={() => navigate('/plants')}>
                            去看看植物
                            <ArrowRight size={16} />
                          </button>
                        </Empty>
                      )}
                    </>
                  )}
                </>
              )}
              {active === 'journal' && (
                <>
                  <PageHeading
                    eyebrow="THE LITTLE THINGS THAT GROW"
                    title="生长日记"
                    description="把每一次花开和新叶，留在时间里。"
                  >
                    <button
                      className="primary-button"
                      disabled={!plants.length}
                      onClick={() => {
                        setTargetId(plants[0]?.id || '');
                        setNote('');
                        setNoteType('note');
                        setModal('note');
                      }}
                    >
                      <Pencil size={17} />
                      写一篇日记
                    </button>
                  </PageHeading>
                  {photos.length > 0 && (
                    <>
                      <SectionTitle title="最近的模样" note="生长相册" />
                      <div className="growth-gallery">
                        {photos.slice(0, 5).map((p) => (
                          <button key={p.id} onClick={() => setLightbox(p.dataUrl)}>
                            <img src={p.dataUrl} alt={p.caption} />
                            <span>
                              {plants.find((plant) => plant.id === p.plantId)?.name}
                              <small>{dateLabel(p.createdAt)}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <SectionTitle title="日常的点点滴滴" note={`${entries.length} 条`} />
                  <div className="journal-list">{entries.map(renderEntry)}</div>
                  {!entries.length && (
                    <Empty
                      title="故事，从今天开始"
                      text="记录一次浇水、一片新叶，或一个普通又美好的日子。"
                    />
                  )}
                </>
              )}
              {active === 'my' && (
                <Settings
                  key={path}
                  section={path.split('/')[2] || ''}
                  profile={profile}
                  setProfile={setProfile}
                  navigate={navigate}
                  back={back}
                  toast={toast}
                  run={run}
                  busy={busy}
                />
              )}
              {active === 'plant' &&
                (currentPlant ? (
                  <>
                    <SubHeading title="植物档案" onBack={back}>
                      <button
                        className={`icon-button ${currentPlant.favorite ? 'hearted' : ''}`}
                        aria-label={currentPlant.favorite ? '取消收藏' : '收藏植物'}
                        onClick={() =>
                          void db.plants.update(currentPlant.id, {
                            favorite: !currentPlant.favorite,
                          })
                        }
                      >
                        <Heart size={20} fill={currentPlant.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="编辑植物"
                        onClick={() => openModal('edit')}
                      >
                        <Pencil size={19} />
                      </button>
                    </SubHeading>
                    <PlantDetail
                      plant={currentPlant}
                      photos={photos.filter((photo) => photo.plantId === currentPlant.id)}
                      entries={entries.filter((entry) => entry.plantId === currentPlant.id)}
                      busy={busy}
                      analyzing={liveJobs.some((job) => job.plantId === currentPlant.id)}
                      failed={jobs.some(
                        (job) => job.plantId === currentPlant.id && job.status === 'failed',
                      )}
                      onPhoto={() => openModal('photo')}
                      onLightbox={setLightbox}
                      onWater={() => openModal('water')}
                      onPlan={() => openModal('water-plan')}
                      onCheck={() => openModal('check')}
                      onNote={() => openModal('note')}
                      onAnalyze={() => startAI(currentPlant)}
                      onAIPlan={() => openModal('plan')}
                      onTasks={() => {
                        setCareTab('queue');
                        navigate('/care');
                      }}
                      renderEntry={renderEntry}
                    />
                  </>
                ) : (
                  <>
                    <SubHeading title="植物档案" onBack={back} />
                    <Empty
                      title="这株植物还没住进花园"
                      text="档案可能已移除，返回花册看看其他朋友吧。"
                    >
                      <button className="primary-button" onClick={() => navigate('/plants')}>
                        返回花册
                      </button>
                    </Empty>
                  </>
                ))}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {!isSubpage && (
        <nav
          className="bottom-nav"
          aria-label="底部导航"
          style={{ gridTemplateColumns: `repeat(${visibleMenus.length}, minmax(0, 1fr))` }}
        >
          <span
            className="bottom-nav-indicator"
            aria-hidden="true"
            style={{
              width: `calc((100% - 14px) / ${visibleMenus.length})`,
              transform: `translateX(${
                Math.max(
                  0,
                  visibleMenus.findIndex((route) => route.id === active),
                ) * 100
              }%)`,
            }}
          />
          {visibleMenus.map((route) => (
            <button
              key={route.id}
              className={active === route.id ? 'active' : ''}
              aria-current={active === route.id ? 'page' : undefined}
              onClick={() => {
                navigate(`/${route.id}`);
                void haptic();
              }}
            >
              <route.icon size={22} strokeWidth={1.8} />
              <span>{route.short}</span>
              {route.id === 'care' && due.length > 0 && <i aria-hidden="true" />}
            </button>
          ))}
        </nav>
      )}
      {liveJobs.length > 0 && !isSubpage && active !== 'care' && (
        <button
          className="background-task"
          onClick={() => {
            setCareTab('queue');
            navigate('/care');
          }}
        >
          <Sparkles size={15} />
          <span>{liveJobs.length} 个 AI 观察正在后台进行</span>
          <ChevronRight size={14} />
        </button>
      )}
      <AnimatePresence>
        {toastText && (
          <motion.div
            role="status"
            className="toast"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
          >
            <Leaf size={18} />
            <span>{toastText}</span>
            <button aria-label="关闭提示" onClick={() => setToastText('')}>
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <input
        ref={photoInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={receivePhoto}
      />
      <input
        ref={cameraInput}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={receivePhoto}
      />
      {modal === 'new' && (
        <Modal title="让新朋友住进花园" onClose={() => setModal(null)}>
          <form onSubmit={savePlantForm}>
            <div className={`photo-picker ${newImage ? 'has-photo' : ''}`}>
              {newImage ? (
                <img src={newImage} alt="待添加的植物" />
              ) : (
                <>
                  <Camera size={35} strokeWidth={1.3} />
                  <b>记录它的第一张照片</b>
                  <small>清晰的叶片和花朵，更容易被了解</small>
                </>
              )}
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => choosePhoto('camera')}
                >
                  <Camera size={16} />
                  拍照
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => choosePhoto('gallery')}
                >
                  <ImagePlus size={16} />
                  从相册选择
                </button>
              </div>
            </div>
            <label>
              给它一个名字
              <input
                required
                autoComplete="off"
                maxLength={80}
                placeholder="比如：窗边的小茉莉"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="form-two-columns">
              <label>
                它住在哪里
                <input
                  required
                  maxLength={100}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  list="plant-locations"
                />
              </label>
              <label>
                建议浇水间隔
                <select
                  value={form.intervalDays}
                  onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })}
                >
                  {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((n) => (
                    <option key={n} value={n}>
                      每 {n} 天
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              想记下什么
              <textarea
                maxLength={2000}
                rows={2}
                placeholder="购买日期、花盆、土壤，或它的故事…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <label className="switch-row">
              <span>
                <Sparkles size={16} />
                创建后后台 AI 识别<small>需先配置 AI；照片将发送至你的模型服务</small>
              </span>
              <input
                type="checkbox"
                checked={autoAI}
                onChange={(e) => setAutoAI(e.target.checked)}
              />
            </label>
            <button className="primary-button full" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}加入我的花园
            </button>
          </form>
        </Modal>
      )}
      {modal === 'photo' && target && (
        <Modal title="记录今天的模样" onClose={() => setModal(null)}>
          <div className="segmented-control">
            <button
              className={photoKind === 'plant' ? 'active' : ''}
              onClick={() => setPhotoKind('plant')}
            >
              植物照片
            </button>
            <button
              className={photoKind === 'soil' ? 'active' : ''}
              onClick={() => setPhotoKind('soil')}
            >
              土表照片
            </button>
          </div>
          <div className={`photo-picker ${newImage ? 'has-photo' : ''}`}>
            {newImage ? (
              <img src={newImage} alt="新的生长照片" />
            ) : (
              <>
                <ImagePlus size={35} />
                <p>
                  {photoKind === 'soil'
                    ? '拍摄盆土表面，帮助观察外观'
                    : '新叶、新花，每一点变化都值得记录'}
                </p>
              </>
            )}
            <div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => choosePhoto('camera')}
              >
                <Camera size={16} />
                拍照
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => choosePhoto('gallery')}
              >
                <ImagePlus size={16} />
                相册
              </button>
            </div>
          </div>
          <button
            className="primary-button full"
            disabled={busy || !newImage}
            onClick={() =>
              void run(async () => {
                await addPhoto(target, newImage, photoKind);
                setModal(null);
                toast('新的模样，已经收藏好了');
              })
            }
          >
            保存照片
            <Check size={17} />
          </button>
        </Modal>
      )}
      {modal === 'note' && (
        <Modal title="写下今天的小美好" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!targetId) throw new Error('请选择一株植物');
                await recordCare(
                  targetId,
                  noteType,
                  note.trim() || `完成了一次${entryLabels[noteType]}。`,
                );
                setModal(null);
                toast('小美好已经记下');
              });
            }}
          >
            <label>
              关于哪位朋友
              <select required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              记录类型
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as Entry['type'])}
              >
                <option value="note">生长日记</option>
                <option value="fertilize">施肥记录</option>
                <option value="prune">修剪记录</option>
              </select>
            </label>
            <label>
              今天的故事
              <textarea
                required
                rows={5}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="今天发现了一片新叶…"
              />
            </label>
            <button className="primary-button full" disabled={busy}>
              收藏这份小美好
              <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === 'check' && target && (
        <Modal title={`看看${target.name}的盆土`} onClose={() => setModal(null)}>
          <p className="modal-description">
            用手指或湿度计检查盆土，选择实际状态。照片里的土表颜色不能代替根区湿度测量。
          </p>
          <div className="moisture-options">
            {(
              [
                { value: 'dry', label: '偏干', desc: '考虑是否需要浇水' },
                { value: 'moist', label: '湿润', desc: '暂时不需要浇水' },
                { value: 'wet', label: '偏湿', desc: '注意通风与排水' },
              ] as const
            ).map((option) => (
              <button
                className={moisture === option.value ? 'selected' : ''}
                key={option.value}
                onClick={() => setMoisture(option.value)}
              >
                <Droplets size={24} />
                <b>{option.label}</b>
                <small>{option.desc}</small>
              </button>
            ))}
          </div>
          <div className="info-note">
            <CalendarDays size={17} />
            <span>
              {moisture === 'dry'
                ? '记录后，明天再提醒检查。如果已经浇水，请点下方「已确认并浇水」。'
                : '记录后，2 天后再提醒检查；暂时不安排浇水。'}
            </span>
          </div>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busy || moisture === 'unknown'}
              onClick={() =>
                void run(async () => {
                  await recordCare(
                    target.id,
                    'check',
                    `实测盆土${moistureLabels[moisture]}，已安排下次检查。`,
                    moisture,
                  );
                  setModal(null);
                  toast('检查完成，下次再来看看它');
                })
              }
            >
              保存检查
              <Check size={17} />
            </button>
            {moisture === 'dry' && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => openModal('water', target)}
              >
                <Droplets size={17} />
                已确认并浇水
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === 'water' && target && (
        <Modal title="浇水打卡" onClose={() => setModal(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await recordWatering(target.id, wateringDays);
                setWaterResult(result);
                setModal('water-done');
                void haptic();
              });
            }}
          >
            <div className="care-confirm-icon">
              <Droplets size={33} />
            </div>
            <h3 className="center">{target.name}</h3>
            <p className="modal-description center">
              确认你已完成浇水。这次打卡后，重新安排下一次建议日期。
            </p>
            <label>
              下次浇水间隔（天）
              <input
                required
                type="number"
                min={1}
                max={60}
                step={1}
                value={wateringDays || ''}
                onChange={(event) => setWateringDays(Number(event.target.value))}
              />
              <small>这株植物单独保存此间隔，可以随季节调整。</small>
            </label>
            {target.analysis && (
              <button
                type="button"
                className="text-button"
                onClick={() => setWateringDays(target.analysis!.watering.suggestedIntervalDays)}
              >
                <Sparkles size={15} />
                使用 AI 参考：{target.analysis.watering.suggestedIntervalDays} 天
              </button>
            )}
            {Number.isInteger(wateringDays) && wateringDays >= 1 && wateringDays <= 60 && (
              <div className="info-note">
                <CalendarDays size={18} />
                <span>
                  下次建议：{wateringDays} 天后，
                  {dateLabel(addCalendarDays(Date.now(), wateringDays))}。
                </span>
              </div>
            )}
            <button className="primary-button full" disabled={busy}>
              <Droplets size={17} />
              确认已浇水
            </button>
            <button
              type="button"
              className="text-button full"
              onClick={() => openModal('check', target)}
            >
              暂不浇水，记录盆土
              <ChevronRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal === 'water-done' && waterResult && (
        <Modal
          title={waterResult.alreadyRecorded ? '今天已经打卡' : '浇水打卡成功'}
          onClose={() => setModal(null)}
        >
          <div className="care-confirm-icon">
            <CheckCheck size={33} />
          </div>
          <h3 className="center">{waterResult.plant.name}</h3>
          <p className="watering-success center">
            建议 {waterResult.plant.wateringIntervalDays} 天后
            <br />
            <b>{dateLabel(waterResult.plant.nextWaterAt)}</b>再检查是否需要浇水。
          </p>
          <p className="modal-description center">
            {profile.notifications
              ? '养护通知会使用你设置的提醒时间。'
              : '开启系统提醒后，到日期会提醒你回来打卡。'}
          </p>
          <button className="primary-button full" onClick={() => setModal(null)}>
            完成
            <Check size={17} />
          </button>
          {!profile.notifications && (
            <button
              className="text-button full"
              onClick={() => {
                setModal(null);
                navigate('/my/notifications');
              }}
            >
              开启系统提醒
              <ChevronRight size={15} />
            </button>
          )}
        </Modal>
      )}
      {modal === 'water-plan' && target && (
        <Modal title="调整浇水间隔" onClose={() => setModal(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await updateWateringPlan(target.id, wateringDays);
                setModal(null);
                toast('浇水间隔已更新，建议日期按上次浇水重新计算');
              });
            }}
          >
            <p className="modal-description">
              {target.name}的专属周期。修改间隔会从上次实际浇水计算下一次建议日期。
            </p>
            <label>
              浇水间隔（天）
              <input
                required
                type="number"
                min={1}
                max={60}
                step={1}
                value={wateringDays || ''}
                onChange={(event) => setWateringDays(Number(event.target.value))}
              />
            </label>
            {target.analysis && (
              <button
                type="button"
                className="text-button"
                onClick={() => setWateringDays(target.analysis!.watering.suggestedIntervalDays)}
              >
                <Sparkles size={15} />
                使用 AI 参考：{target.analysis.watering.suggestedIntervalDays} 天
              </button>
            )}
            <button className="primary-button full" disabled={busy}>
              保存浇水间隔
              <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === 'edit' && target && (
        <Modal title="编辑植物档案" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const changed = target.intervalDays !== form.intervalDays;
                await db.plants.update(target.id, {
                  ...form,
                  name: form.name.trim(),
                  location: form.location.trim(),
                  updatedAt: Date.now(),
                  ...(changed ? { nextCheckAt: Date.now() + form.intervalDays * day } : {}),
                });
                setModal(null);
                toast('植物档案已更新');
              });
            }}
          >
            <label>
              植物名字
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              所在位置
              <input
                required
                maxLength={100}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label>
              盆土检查周期（天）
              <input
                type="number"
                required
                min={1}
                max={60}
                value={form.intervalDays}
                onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })}
              />
              <small>改变周期后，从今天重新安排下次检查。</small>
            </label>
            <label>
              它的故事
              <textarea
                rows={4}
                maxLength={2000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <button className="primary-button full" disabled={busy}>
              保存档案
              <Check size={17} />
            </button>
            <button
              type="button"
              className="text-button danger full"
              disabled={busy}
              onClick={() => openModal('delete', target)}
            >
              <Trash2 size={14} />
              移除这株植物
            </button>
          </form>
        </Modal>
      )}
      {modal === 'plan' && target?.analysis && (
        <Modal title="它的养护检查计划" onClose={() => setModal(null)}>
          <p>{target.analysis.watering.advice}</p>
          <div className="plan-highlight">
            <CalendarDays size={24} />
            <span>
              建议每 <b>{target.analysis.watering.suggestedIntervalDays}</b> 天检查盆土
            </span>
          </div>
          <div className="info-note">
            <ShieldCheck size={18} />
            <span>
              采用后会调整检查周期。此计划提醒检查，不直接要求浇水；可在编辑档案中继续调整。
            </span>
          </div>
          <button
            className="primary-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const days = target.analysis!.watering.suggestedIntervalDays;
                await db.plants.update(target.id, {
                  intervalDays: days,
                  nextCheckAt: Date.now() + (target.analysis!.watering.needsCheck ? 0 : days * day),
                  updatedAt: Date.now(),
                });
                setModal(null);
                toast('检查计划已更新');
              })
            }
          >
            采用这个检查计划
            <Check size={17} />
          </button>
        </Modal>
      )}
      {modal === 'delete' && target && (
        <Modal title="移除这株植物" onClose={() => setModal(null)}>
          <p>将删除「{target.name}」在本机的档案、照片和日记。建议先导出备份。这项操作无法撤销。</p>
          <button
            className="danger-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                for (const job of liveJobs.filter((j) => j.plantId === target.id))
                  await api(`/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
                await deletePlant(target.id);
                setModal(null);
                navigate('/plants');
                toast('植物档案已移除');
              })
            }
          >
            <Trash2 size={16} />
            确认移除
          </button>
        </Modal>
      )}
      {modal === 'start' && (
        <Modal title="这是你的花园了" onClose={() => setModal(null)}>
          <p>清除用于展示的示例植物，拍照添加你家里的第一株花。</p>
          <button
            className="primary-button full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await removeDemo();
                setModal(null);
                newPlant();
              })
            }
          >
            <Camera size={17} />
            清除示例，添加我的植物
          </button>
        </Modal>
      )}
      {release && (
        <Modal
          title="小花园有了新变化"
          onClose={() => {
            sessionStorage.setItem('mumu-update-later', release.version);
            setRelease(null);
          }}
        >
          <span className="version-tag">新版本 {release.version}</span>
          <pre className="update-notes">{release.notes}</pre>
          <UpdateAction
            key={release.version}
            release={release}
            later={() => {
              sessionStorage.setItem('mumu-update-later', release.version);
              setRelease(null);
            }}
          />
        </Modal>
      )}
      {lightbox && (
        <Modal title="生长的模样" wide onClose={() => setLightbox('')}>
          <img className="lightbox-image" src={lightbox} alt="植物照片放大查看" />
        </Modal>
      )}
      <datalist id="plant-locations">
        <option value="阳台" />
        <option value="客厅" />
        <option value="书房" />
        <option value="卧室" />
        <option value="餐厅" />
      </datalist>
    </div>
  );
}
