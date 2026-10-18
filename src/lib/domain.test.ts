import { describe, test, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  db,
  createPlant,
  recordCare,
  recordWatering,
  updateWateringPlan,
  exportGarden,
  importGarden,
  deletePlant,
  day,
} from './db';
import {
  addCalendarDays,
  localDateValue,
  parseWateringDate,
  startOfDay,
  wateredToday,
  waterReminderAt,
  wateringDue,
} from './watering';
import { careReminders } from './reminders';
import { newerVersion } from './updates';
const photo = 'data:image/jpeg;base64,/9j/AA==';
beforeEach(async () => {
  await Promise.all([db.plants.clear(), db.photos.clear(), db.entries.clear(), db.jobs.clear()]);
});
describe('local garden persistence', () => {
  test('a previous watering date anchors reminders and survives backup without claiming current soil moisture', async () => {
    const lastWateredAt = parseWateringDate(localDateValue(addCalendarDays(Date.now(), -3)));
    const plant = await createPlant(
      { name: '三天前浇过的茉莉', location: '阳台', notes: '', intervalDays: 7, lastWateredAt },
      photo,
    );
    expect(plant.nextWaterAt).toBe(addCalendarDays(lastWateredAt, 7));
    expect(startOfDay(plant.nextWaterAt)).toBe(startOfDay(addCalendarDays(Date.now(), 4)));
    expect(plant.nextCheckAt).toBe(plant.nextWaterAt);
    expect(plant.moisture).toBe('unknown');
    const history = await db.entries
      .where('plantId')
      .equals(plant.id)
      .filter((e) => e.type === 'water')
      .toArray();
    expect(history).toHaveLength(1);
    expect(history[0].createdAt).toBe(lastWateredAt);
    const backup = await exportGarden();
    await deletePlant(plant.id);
    await importGarden(backup);
    const restored = (await db.plants.get(plant.id))!;
    expect(restored.lastWateredAt).toBe(lastWateredAt);
    expect(restored.nextWaterAt).toBe(plant.nextWaterAt);
  });

  test('watering today avoids duplicates and a much earlier date is immediately due', async () => {
    const input = { name: '茉莉', location: '阳台', notes: '', intervalDays: 7 };
    const today = await createPlant(
      { ...input, lastWateredAt: parseWateringDate(localDateValue()) },
      photo,
    );
    expect(wateredToday(today)).toBe(true);
    expect((await recordWatering(today.id)).alreadyRecorded).toBe(true);
    expect(
      await db.entries
        .where('plantId')
        .equals(today.id)
        .filter((e) => e.type === 'water')
        .count(),
    ).toBe(1);
    const older = await createPlant(
      { ...input, lastWateredAt: addCalendarDays(startOfDay(Date.now()), -10) },
      photo,
    );
    expect(wateringDue(older)).toBe(true);
    expect(wateredToday(older)).toBe(false);
  });

  test('invalid and future watering dates cannot create partial plants or records', async () => {
    for (const lastWateredAt of [NaN, Infinity, addCalendarDays(Date.now(), 1)]) {
      await expect(
        createPlant(
          { name: '茉莉', location: '阳台', notes: '', intervalDays: 7, lastWateredAt },
          photo,
        ),
      ).rejects.toThrow('上次浇水日期');
    }
    expect(await db.plants.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  test('calendar dates remain local near midnight and reject impossible or future days', () => {
    const now = new Date(2026, 2, 10, 0, 15).getTime();
    expect(localDateValue(now)).toBe('2026-03-10');
    expect(parseWateringDate('2026-03-07', now)).toBe(new Date(2026, 2, 7).getTime());
    expect(localDateValue(addCalendarDays(parseWateringDate('2026-03-07', now), 3))).toBe(
      '2026-03-10',
    );
    for (const value of ['', '2026-02-30', '2026-13-01', '0000-01-01', '2026-03-11'])
      expect(() => parseWateringDate(value, now)).toThrow();
  });

  test('care records update the next check and delete cascades through photos and diary', async () => {
    const p = await createPlant(
      { name: '小茉莉', location: '阳台', notes: '', intervalDays: 7 },
      photo,
    );
    await recordCare(p.id, 'water', '已经检查并浇水');
    const watered = (await db.plants.get(p.id))!;
    expect(watered.moisture).toBe('moist');
    expect(watered.nextCheckAt - watered.lastWateredAt!).toBe(7 * day);
    await recordCare(p.id, 'check', '土壤偏湿', 'wet');
    const checked = (await db.plants.get(p.id))!;
    expect(checked.nextCheckAt - checked.updatedAt).toBe(2 * day);
    expect(checked.nextWaterAt).toBe(watered.nextWaterAt);
    await deletePlant(p.id);
    expect(await db.photos.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
  });
  test('watering check-in saves a per-plant cycle and prevents duplicate entries on the same day', async () => {
    const first = await createPlant(
      { name: '茉莉', location: '阳台', notes: '', intervalDays: 7 },
      photo,
    );
    const second = await createPlant(
      { name: '多肉', location: '客厅', notes: '', intervalDays: 14 },
      photo,
    );
    const result = await recordWatering(first.id, 5);
    expect(result.alreadyRecorded).toBe(false);
    expect(result.plant.nextWaterAt).toBe(addCalendarDays(result.plant.lastWateredAt!, 5));
    expect(result.plant.wateringIntervalDays).toBe(5);
    expect(wateredToday(result.plant)).toBe(true);
    await recordWatering(first.id, 10);
    expect((await db.plants.get(first.id))!.nextWaterAt).toBe(result.plant.nextWaterAt);
    expect(
      await db.entries
        .where('plantId')
        .equals(first.id)
        .filter((entry) => entry.type === 'water')
        .count(),
    ).toBe(1);
    expect((await db.plants.get(second.id))!.wateringIntervalDays).toBe(14);
  });

  test('interval edits anchor to the last real watering and wet-soil checks postpone only the reminder', async () => {
    const plant = await createPlant(
      { name: '小花', location: '阳台', notes: '', intervalDays: 7 },
      photo,
    );
    const previous = addCalendarDays(Date.now(), -4);
    await db.plants.update(plant.id, { lastWateredAt: previous });
    await updateWateringPlan(plant.id, 3);
    const changed = (await db.plants.get(plant.id))!;
    expect(changed.nextWaterAt).toBe(addCalendarDays(previous, 3));
    await recordCare(plant.id, 'check', '盆土仍湿', 'wet');
    const checked = (await db.plants.get(plant.id))!;
    expect(checked.nextWaterAt).toBe(changed.nextWaterAt);
    expect(checked.lastWateredAt).toBe(previous);
    expect(waterReminderAt(checked)).toBe(checked.nextCheckAt);
    await expect(updateWateringPlan(plant.id, 0)).rejects.toThrow('整数');
    await expect(recordWatering(plant.id, 2.5)).rejects.toThrow('整数');
    expect(
      await db.entries
        .where('plantId')
        .equals(plant.id)
        .filter((entry) => entry.type === 'water')
        .count(),
    ).toBe(0);
  });

  test('upgrading the old database preserves flower records and creates watering plans', async () => {
    const plant = await createPlant(
      { name: '老档案', location: '阳台', notes: '', intervalDays: 6 },
      photo,
    );
    const { wateringIntervalDays, nextWaterAt, waterSnoozedUntil, ...legacyPlant } = plant;
    const previous = addCalendarDays(Date.now(), -2);
    legacyPlant.lastWateredAt = previous;
    db.close();
    await Dexie.delete('mumu-flowers');
    const legacy = new Dexie('mumu-flowers');
    legacy.version(1).stores({
      plants: 'id,location,createdAt,demo',
      photos: 'id,plantId,createdAt',
      entries: 'id,plantId,createdAt,type',
      jobs: 'id,plantId,status,createdAt',
    });
    await legacy.table('plants').put(legacyPlant);
    await legacy.table('entries').put({
      id: 'old-entry',
      plantId: plant.id,
      type: 'note',
      text: '第一朵花',
      createdAt: previous,
      demo: false,
    });
    legacy.close();
    await db.open();
    const upgraded = (await db.plants.get(plant.id))!;
    expect(upgraded.wateringIntervalDays).toBe(6);
    expect(upgraded.nextWaterAt).toBe(addCalendarDays(previous, 6));
    expect(upgraded.waterSnoozedUntil).toBeNull();
    expect((await db.entries.get('old-entry'))!.text).toBe('第一朵花');
  });

  test('reminders keep future watering scheduled even when a soil check comes earlier', async () => {
    const plant = await createPlant(
      { name: '兰花', location: '阳台', notes: '', intervalDays: 7 },
      photo,
    );
    const now = new Date('2026-10-11T08:00:00').getTime();
    const schedule = {
      ...plant,
      nextCheckAt: addCalendarDays(now, 2),
      nextWaterAt: addCalendarDays(now, 7),
    };
    const reminders = careReminders([schedule], { reminderHour: 9 }, now);
    expect(reminders.map((item) => item.extra.kind)).toEqual(['check', 'water']);
    expect(reminders[1].schedule.at.getDate()).toBe(18);
    expect(reminders[1].schedule.at.getHours()).toBe(9);
    expect(reminders[0].id).not.toBe(reminders[1].id);
    expect(
      careReminders(
        [{ ...schedule, nextCheckAt: schedule.nextWaterAt }],
        { reminderHour: 9 },
        now,
      ).map((item) => item.extra.kind),
    ).toEqual(['water']);
    expect(careReminders([{ ...schedule, demo: true }], { reminderHour: 9 }, now)).toEqual([]);
  });
  test('backup restores photos and records, rejects dangerous URLs without partially writing', async () => {
    const p = await createPlant(
      { name: '小花', location: '书房', notes: '', intervalDays: 3 },
      photo,
    );
    const raw = await exportGarden();
    await deletePlant(p.id);
    expect(await importGarden(raw)).toBe(1);
    expect(await db.photos.count()).toBe(1);
    const malicious = JSON.parse(raw);
    malicious.plants[0].id = 'new-id';
    malicious.plants[0].cover = 'javascript:alert(1)';
    await expect(importGarden(JSON.stringify(malicious))).rejects.toThrow('格式');
    expect(await db.plants.count()).toBe(1);
    expect(raw).not.toContain('apiKey');
    const legacy = JSON.parse(raw);
    delete legacy.plants[0].wateringIntervalDays;
    delete legacy.plants[0].nextWaterAt;
    delete legacy.plants[0].waterSnoozedUntil;
    await importGarden(JSON.stringify(legacy));
    expect((await db.plants.get(p.id))!.wateringIntervalDays).toBe(3);
    expect((await db.plants.get(p.id))!.nextWaterAt).toBe(addCalendarDays(p.createdAt, 3));
  });
});
test('compares numeric versions and ignores non-release tags', () => {
  expect(newerVersion('v1.0.10', '1.0.9')).toBe(true);
  expect(newerVersion('v1.0.1', '1.0.1')).toBe(false);
  expect(newerVersion('1.0.2', '1.1.0')).toBe(false);
  expect(newerVersion('v1.1.0-beta', '1.0.0')).toBe(false);
});
