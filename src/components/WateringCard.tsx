import { CalendarDays, Check, Droplets } from 'lucide-react';
import type { Plant } from '../types';
import { dateLabel, moistureLabels } from './ui';
import { wateredToday, waterReminderAt, wateringLabel } from '../lib/watering';

export function WateringCard({
  plant,
  busy,
  onWater,
  onPlan,
}: {
  plant: Plant;
  busy: boolean;
  onWater: () => void;
  onPlan: () => void;
}) {
  const completed = wateredToday(plant);
  const nextAt = waterReminderAt(plant);
  return (
    <section className="watering-card" aria-label={`${plant.name}的浇水计划`}>
      <div className="watering-card-heading">
        <span>
          <Droplets size={21} />
          <b>浇水打卡</b>
        </span>
        <button className="text-button" onClick={onPlan}>
          调整间隔
          <CalendarDays size={15} />
        </button>
      </div>
      <div className="watering-dates">
        <div>
          <small>上次浇水</small>
          <b>{plant.lastWateredAt ? dateLabel(plant.lastWateredAt) : '尚未打卡'}</b>
        </div>
        <div>
          <small>下次建议提醒</small>
          <b>{dateLabel(nextAt)}</b>
        </div>
      </div>
      <p className="watering-next">
        每 {plant.wateringIntervalDays} 天一次 · {wateringLabel(nextAt)}
      </p>
      <p className="watering-soil">
        盆土实测：{moistureLabels[plant.moisture]}。浇水前先看看盆土，仍湿润时可记录检查。
      </p>
      <button className="primary-button full" disabled={busy || completed} onClick={onWater}>
        {completed ? <Check size={18} /> : <Droplets size={18} />}
        {completed ? '今天已打卡' : '浇水打卡'}
      </button>
    </section>
  );
}
