import { describe, test, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, createPlant, recordCare, exportGarden, importGarden, deletePlant, day } from './db';
import { newerVersion } from './updates';
const photo = 'data:image/jpeg;base64,/9j/AA==';
beforeEach(async () => {
  await Promise.all([db.plants.clear(), db.photos.clear(), db.entries.clear(), db.jobs.clear()]);
});
describe('local garden persistence', () => {
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
    await deletePlant(p.id);
    expect(await db.photos.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
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
  });
});
test('compares numeric versions and ignores non-release tags', () => {
  expect(newerVersion('v1.0.10', '1.0.9')).toBe(true);
  expect(newerVersion('v1.0.1', '1.0.1')).toBe(false);
  expect(newerVersion('1.0.2', '1.1.0')).toBe(false);
  expect(newerVersion('v1.1.0-beta', '1.0.0')).toBe(false);
});
