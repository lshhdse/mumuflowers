import type { Plant, Profile } from '../types';
import { startOfDay, waterReminderAt } from './watering';

export function notificationId(id: string) {
  let value = 7;
  for (const char of id) value = (Math.imul(value, 31) + char.charCodeAt(0)) | 0;
  return ((value >>> 0) % 2000000000) + 1;
}

export function careReminders(
  plants: Plant[],
  profile: Pick<Profile, 'reminderHour'>,
  now = Date.now(),
) {
  return plants
    .filter((plant) => !plant.demo)
    .flatMap((plant) => {
      const events: { kind: 'water' | 'check'; dueAt: number }[] = [
        { kind: 'water', dueAt: waterReminderAt(plant) },
      ];
      if (startOfDay(plant.nextCheckAt) !== startOfDay(waterReminderAt(plant)))
        events.push({ kind: 'check', dueAt: plant.nextCheckAt });
      return events.map((event) => {
        const at = new Date(event.dueAt);
        at.setHours(profile.reminderHour, 0, 0, 0);
        if (at.getTime() <= now) at.setTime(now + 60000);
        return {
          id: notificationId(`${plant.id}:${event.kind}`),
          title:
            event.kind === 'water' ? `${plant.name} 到了建议浇水日期` : `${plant.name} 的盆土检查`,
          body:
            event.kind === 'water'
              ? `按每 ${plant.wateringIntervalDays} 天的间隔提醒。确认盆土需要水后浇水，点这里打卡并安排下一次。`
              : '看看盆土和叶片。尚未浇水时，选择记录检查即可。',
          schedule: { at, allowWhileIdle: true },
          isExactNotification: false,
          channelId: 'plant-care',
          extra: { plantId: plant.id, kind: event.kind },
        };
      });
    })
    .sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime())
    .slice(0, 60);
}
