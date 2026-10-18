import type { Plant } from '../types';

export const startOfDay = (at: number) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export function addCalendarDays(at: number, days: number) {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

// Date inputs use local calendar dates, never UTC ISO dates.
export function localDateValue(at = Date.now()) {
  const date = new Date(at);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseWateringDate(value: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请选择上次浇水日期');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (year < 1 || date.getTime() < 0 || localDateValue(date.getTime()) !== value)
    throw new Error('请选择有效的上次浇水日期');
  if (date.getTime() > startOfDay(now)) throw new Error('上次浇水日期不能晚于今天');
  return date.getTime();
}

export function validateWateringInterval(days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 60)
    throw new Error('浇水间隔请输入 1～60 之间的整数天数');
  return days;
}

type PreviousPlant = Pick<Plant, 'intervalDays' | 'lastWateredAt' | 'createdAt'> &
  Partial<Pick<Plant, 'wateringIntervalDays' | 'nextWaterAt' | 'waterSnoozedUntil'>>;

export function wateringPlan(plant: PreviousPlant) {
  const wateringIntervalDays = plant.wateringIntervalDays ?? plant.intervalDays;
  return {
    wateringIntervalDays,
    nextWaterAt:
      plant.nextWaterAt ??
      addCalendarDays(plant.lastWateredAt ?? plant.createdAt, wateringIntervalDays),
    waterSnoozedUntil: plant.waterSnoozedUntil ?? null,
  };
}

export function wateredToday(plant: Pick<Plant, 'lastWateredAt'>, now = Date.now()) {
  return plant.lastWateredAt !== null && startOfDay(plant.lastWateredAt) === startOfDay(now);
}

export function waterReminderAt(plant: Pick<Plant, 'nextWaterAt' | 'waterSnoozedUntil'>) {
  return Math.max(plant.nextWaterAt, plant.waterSnoozedUntil ?? 0);
}

export function wateringDue(
  plant: Pick<Plant, 'nextWaterAt' | 'waterSnoozedUntil'>,
  now = Date.now(),
) {
  return startOfDay(waterReminderAt(plant)) <= startOfDay(now);
}

export function nextCareAt(
  plant: Pick<Plant, 'nextWaterAt' | 'nextCheckAt' | 'waterSnoozedUntil'>,
) {
  return Math.min(waterReminderAt(plant), plant.nextCheckAt);
}

export function wateringLabel(at: number, now = Date.now()) {
  const difference = Math.round((startOfDay(at) - startOfDay(now)) / 86400000);
  return difference <= 0 ? '已到建议浇水日期' : `${difference} 天后建议浇水`;
}
