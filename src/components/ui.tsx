import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Flower2, ChevronRight, ArrowLeft, Leaf, Droplets, Check } from 'lucide-react';
import type { Plant } from '../types';
import { wateredToday, waterReminderAt, wateringLabel } from '../lib/watering';

export const healthLabels = {
  healthy: '状态良好',
  attention: '需要关注',
  urgent: '及时检查',
  unknown: '等待了解',
};
export const moistureLabels = { dry: '偏干', moist: '湿润', wet: '偏湿', unknown: '未记录' };
export const entryLabels = {
  water: '浇水',
  check: '盆土检查',
  fertilize: '施肥',
  prune: '修剪',
  note: '日记',
  photo: '成长照片',
  analysis: 'AI 观察',
};
export const jobLabels = {
  submitting: '正在提交',
  queued: '排队中',
  running: '分析中',
  done: '已完成',
  failed: '未完成',
  cancelled: '已取消',
};
export const dateLabel = (value: number, withYear = false) =>
  new Date(value).toLocaleDateString('zh-CN', {
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'long',
    day: 'numeric',
  });
export function dueLabel(at: number) {
  const day = (v: number) => {
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const n = Math.round((day(at) - day(Date.now())) / 86400000);
  return n < 0 ? `已到检查时间` : n === 0 ? '今天检查' : n === 1 ? '明天检查' : `${n} 天后检查`;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-icon">
        <Flower2 size={29} strokeWidth={1.5} />
      </span>
      <div>
        <b>
          MUMU<span>Flowers</span>
        </b>
        {!compact && <small>好好生活，慢慢生长</small>}
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function SubHeading({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="sub-heading">
      <button className="icon-button" aria-label="返回" onClick={onBack}>
        <ArrowLeft size={21} />
      </button>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
export function SectionTitle({
  title,
  note,
  action,
  onAction,
}: {
  title: string;
  note?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>
        {title}
        {note && <span>{note}</span>}
      </h2>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Leaf size={35} strokeWidth={1.3} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function PlantCard({
  plant,
  onClick,
  onWater,
  busy,
}: {
  plant: Plant;
  onClick: () => void;
  onWater: () => void;
  busy: boolean;
}) {
  const completed = wateredToday(plant);
  return (
    <motion.article
      layout
      className="plant-card"
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.985 }}
    >
      <button className="plant-card-open" aria-label={`查看${plant.name}档案`} onClick={onClick}>
        <div className="plant-card-image">
          <img src={plant.cover} alt={plant.name} loading="lazy" />
          {plant.demo && <span className="demo-card-label">示例</span>}
          <span className={`status-pill ${plant.health}`}>
            <i />
            {healthLabels[plant.health]}
          </span>
          {plant.favorite && <span className="favorite-marker">♥</span>}
        </div>
        <div className="plant-card-content">
          <small>
            {plant.location} <span>· {plant.species}</span>
          </small>
          <h3>{plant.name}</h3>
          <div className="plant-card-bottom">
            <span>
              <span className="water-dot" /> {wateringLabel(waterReminderAt(plant))}
            </span>
            <span className="card-arrow">
              <ChevronRight size={17} />
            </span>
          </div>
        </div>
      </button>
      <div className="plant-watering-footer">
        <small>每 {plant.wateringIntervalDays} 天</small>
        <button
          aria-label={`${plant.name}${completed ? '今天已打卡' : '浇水打卡'}`}
          onClick={onWater}
          disabled={busy || completed}
        >
          {completed ? <Check size={14} /> : <Droplets size={14} />}
          {completed ? '已打卡' : '浇水打卡'}
        </button>
      </div>
    </motion.article>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,a[href]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = scroll;
      old?.focus();
    };
  }, []);
  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          ref={ref}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`modal ${wide ? 'wide' : ''}`}
          initial={{ y: 30, scale: 0.97 }}
          animate={{ y: 0, scale: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-title">
            <h2>{title}</h2>
            <button className="icon-button" aria-label="关闭" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
