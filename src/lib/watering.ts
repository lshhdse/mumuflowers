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
