import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import type { Plant, Photo, Entry, Job, Profile, Moisture } from '../types';
import { defaultBottomMenus, normalizeBottomMenus } from './navigation';
import { addCalendarDays, validateWateringInterval, wateredToday, wateringPlan } from './watering';

class GardenDB extends Dexie {
  plants!: Table<Plant, string>;
  photos!: Table<Photo, string>;
  entries!: Table<Entry, string>;
  jobs!: Table<Job, string>;
  constructor() {
    super('mumu-flowers');
    this.version(1).stores({
      plants: 'id,location,createdAt,demo',
      photos: 'id,plantId,createdAt',
      entries: 'id,plantId,createdAt,type',
      jobs: 'id,plantId,status,createdAt',
    });
    this.version(2)
      .stores({ plants: 'id,location,createdAt,demo,nextWaterAt' })
      .upgrade(async (transaction) => {
        await transaction
          .table('plants')
          .toCollection()
          .modify((plant) => Object.assign(plant, wateringPlan(plant)));
      });
  }
}
export const db = new GardenDB();
export const day = 86400000;
export const uuid = () => crypto.randomUUID();
export const defaultProfile: Profile = {
  name: 'MUMU',
  gardenName: '我的小花园',
  notifications: false,
  reminderHour: 9,
  theme: 'light',
  bottomMenus: [...defaultBottomMenus],
};
export function loadProfile(): Profile {
  try {
    const stored = JSON.parse(localStorage.getItem('mumu-profile') || '{}');
    return {
      ...defaultProfile,
      ...stored,
      bottomMenus: normalizeBottomMenus(stored?.bottomMenus),
    };
  } catch {
    return { ...defaultProfile, bottomMenus: [...defaultBottomMenus] };
  }
}
export function saveProfile(profile: Profile) {
  localStorage.setItem('mumu-profile', JSON.stringify(profile));
}

let initialization: Promise<void> | undefined;
export function initializeGarden() {
  initialization ??= initializeOnce().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
async function initializeOnce() {
  await db.open();
  if (localStorage.getItem('mumu-initialized')) return;
  if (!(await db.plants.count())) {
    const now = Date.now();
    const seeds: [string, string, string, string, Plant['health'], number][] = [
      ['窗边的小森林', '观叶植物', '客厅', 'monstera', 'healthy', 3],
      ['春日花束', '鲜切花', '餐厅', 'hydrangea', 'attention', 0],
      ['阳台的多肉', '多肉植物', '阳台', 'succulent', 'healthy', 9],
      ['一束好心情', '鲜切花', '书房', 'flowers', 'healthy', 2],
    ];
    const plants: Plant[] = seeds.map(([name, species, location, file, health, days], index) => ({
      id: `demo-${index}`,
      name,
      species,
      location,
      cover: `/photos/${file}.jpg`,
      health,
      moisture: 'unknown',
      intervalDays: index === 2 ? 14 : 7,
      wateringIntervalDays: index === 2 ? 14 : 7,
      nextWaterAt: addCalendarDays(now, days),
      waterSnoozedUntil: null,
      nextCheckAt: now + days * day,
      lastWateredAt: now - (7 - Math.min(days, 7)) * day,
      notes: '这是示例档案，用于体验界面。照片和养护记录不代表你的真实植物。',
      createdAt: now - (30 + index * 12) * day,
      updatedAt: now,
      favorite: index === 0,
      demo: true,
    }));
    await db.transaction('rw', db.plants, db.entries, async () => {
      await db.plants.bulkAdd(plants);
      await db.entries.bulkAdd(
        plants.slice(0, 3).map((p, i) => ({
          id: uuid(),
          plantId: p.id,
          type: i === 1 ? 'note' : 'water',
          text: i === 1 ? '新鲜的花，让今天也变得柔软。' : '照顾好每一片新生的叶子。',
          createdAt: now - i * day,
          demo: true,
        })),
      );
    });
  }
  localStorage.setItem('mumu-initialized', 'true');
}

export async function removeDemo() {
  const demos = await db.plants.filter((p) => p.demo).primaryKeys();
  await db.transaction('rw', db.plants, db.entries, db.photos, db.jobs, async () => {
    await db.plants.bulkDelete(demos);
    await db.entries.where('plantId').anyOf(demos).delete();
    await db.photos.where('plantId').anyOf(demos).delete();
    await db.jobs.where('plantId').anyOf(demos).delete();
  });
}

export async function createPlant(
  input: Pick<Plant, 'name' | 'location' | 'notes' | 'intervalDays'>,
  photoData: string,
) {
  const now = Date.now();
  const id = uuid();
  validateWateringInterval(input.intervalDays);
  const plant: Plant = {
    ...input,
    id,
    species: '待识别植物',
    cover: photoData,
    health: 'unknown',
    moisture: 'unknown',
    wateringIntervalDays: input.intervalDays,
    nextWaterAt: addCalendarDays(now, input.intervalDays),
    waterSnoozedUntil: null,
    nextCheckAt: now + input.intervalDays * day,
    lastWateredAt: null,
    createdAt: now,
    updatedAt: now,
    favorite: false,
    demo: false,
  };
  await db.transaction('rw', db.plants, db.photos, db.entries, async () => {
    await db.plants.add(plant);
    await db.photos.add({
      id: uuid(),
      plantId: id,
      dataUrl: photoData,
      kind: 'plant',
      createdAt: now,
      caption: '第一次见面',
    });
    await db.entries.add({
      id: uuid(),
      plantId: id,
      type: 'note',
      text: '欢迎来到我的小花园。',
      createdAt: now,
      demo: false,
    });
  });
  return plant;
}
export async function addPhoto(plant: Plant, dataUrl: string, kind: Photo['kind']) {
  const now = Date.now();
  await db.transaction('rw', db.photos, db.plants, db.entries, async () => {
    await db.photos.add({
      id: uuid(),
      plantId: plant.id,
      dataUrl,
      kind,
      createdAt: now,
      caption: kind === 'soil' ? '盆土观察' : '生长记录',
    });
    await db.plants.update(plant.id, {
      ...(kind === 'plant' ? { cover: dataUrl } : {}),
      updatedAt: now,
    });
    await db.entries.add({
      id: uuid(),
      plantId: plant.id,
      type: 'photo',
      text: kind === 'soil' ? '添加了一张土表照片。' : '记录了今天的模样。',
      createdAt: now,
      demo: plant.demo,
    });
  });
}

export async function recordCare(
  plantId: string,
  type: Entry['type'],
  text: string,
  moisture?: Moisture,
) {
  if (type === 'water') return recordWatering(plantId, undefined, text);
  await db.transaction('rw', db.plants, db.entries, async () => {
    const plant = await db.plants.get(plantId);
    if (!plant) throw new Error('花卉档案不存在');
    const now = Date.now();
    const update: Partial<Plant> = { updatedAt: now };
    if (type === 'check') {
      update.moisture = moisture || 'unknown';
      update.nextCheckAt = now + (moisture === 'dry' ? 1 : 2) * day;
      update.waterSnoozedUntil = update.nextCheckAt;
    }
    await db.plants.update(plantId, update);
    await db.entries.add({ id: uuid(), plantId, type, text, createdAt: now, demo: plant.demo });
  });
}

export async function recordWatering(plantId: string, intervalDays?: number, note?: string) {
  return db.transaction('rw', db.plants, db.entries, async () => {
    const plant = await db.plants.get(plantId);
    if (!plant) throw new Error('花卉档案不存在');
    const now = Date.now();
    if (wateredToday(plant, now)) return { plant, alreadyRecorded: true };
    const days = validateWateringInterval(intervalDays ?? plant.wateringIntervalDays);
    const updated: Plant = {
      ...plant,
      wateringIntervalDays: days,
      nextWaterAt: addCalendarDays(now, days),
      lastWateredAt: now,
      waterSnoozedUntil: null,
      nextCheckAt: addCalendarDays(now, plant.intervalDays),
      moisture: 'moist',
      updatedAt: now,
    };
    await db.plants.put(updated);
    await db.entries.add({
      id: uuid(),
      plantId,
      type: 'water',
      text: note ?? `浇水打卡完成，建议 ${days} 天后再次检查是否需要浇水。`,
      createdAt: now,
      demo: plant.demo,
    });
    return { plant: updated, alreadyRecorded: false };
  });
}

export async function updateWateringPlan(plantId: string, intervalDays: number) {
  const days = validateWateringInterval(intervalDays);
  return db.transaction('rw', db.plants, async () => {
    const plant = await db.plants.get(plantId);
    if (!plant) throw new Error('花卉档案不存在');
    await db.plants.update(plantId, {
      wateringIntervalDays: days,
      nextWaterAt: addCalendarDays(plant.lastWateredAt ?? plant.createdAt, days),
      updatedAt: Date.now(),
    });
  });
}
export async function deletePlant(plantId: string) {
  await db.transaction('rw', db.plants, db.photos, db.entries, db.jobs, async () => {
    await db.plants.delete(plantId);
    await db.photos.where('plantId').equals(plantId).delete();
    await db.entries.where('plantId').equals(plantId).delete();
    await db.jobs.where('plantId').equals(plantId).delete();
  });
}

const timestamp = z.number().finite().min(0).max(8640000000000000);
const photoUrl = z
  .string()
  .max(1800000)
  .refine(
    (v) =>
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
      /^\/photos\/[a-z]+\.jpg$/.test(v),
  );
const analysisSchema = z.object({
  commonName: z.string().max(80),
  scientificName: z.string().max(120),
  confidence: z.enum(['high', 'medium', 'low']),
  health: z.enum(['healthy', 'attention', 'urgent', 'unknown']),
  summary: z.string().max(1500),
  observations: z.array(z.string().max(400)).max(8),
  soil: z.object({
    surface: z.enum(['dry', 'moist', 'wet', 'unknown']),
    note: z.string().max(700),
  }),
  watering: z.object({
    needsCheck: z.boolean(),
    suggestedIntervalDays: z.number().int().min(1).max(60),
    advice: z.string().max(800),
  }),
  care: z.object({
    light: z.string().max(700),
    temperature: z.string().max(300),
    fertilizer: z.string().max(700),
    pruning: z.string().max(700),
  }),
  warnings: z.array(z.string().max(400)).max(6),
});
const plantSchema = z.object({
  id: z.string().max(80),
  name: z.string().min(1).max(80),
  species: z.string().max(120),
  location: z.string().max(100),
  notes: z.string().max(2000),
  cover: photoUrl,
  health: z.enum(['healthy', 'attention', 'urgent', 'unknown']),
  moisture: z.enum(['dry', 'moist', 'wet', 'unknown']),
  intervalDays: z.number().int().min(1).max(60),
  wateringIntervalDays: z.number().int().min(1).max(60).optional(),
  nextWaterAt: timestamp.optional(),
  waterSnoozedUntil: timestamp.nullable().optional(),
  nextCheckAt: timestamp,
  lastWateredAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  favorite: z.boolean(),
  demo: z.boolean(),
  analysis: analysisSchema.optional(),
  analysisAt: timestamp.optional(),
});
const backupSchema = z.object({
  format: z.literal('mumu-flowers'),
  version: z.literal(1),
  plants: z.array(plantSchema).max(2000),
  photos: z
    .array(
      z.object({
        id: z.string().max(80),
        plantId: z.string().max(80),
        dataUrl: photoUrl,
        kind: z.enum(['plant', 'soil']),
        createdAt: timestamp,
        caption: z.string().max(300),
      }),
    )
    .max(10000),
  entries: z
    .array(
      z.object({
        id: z.string().max(80),
        plantId: z.string().max(80),
        type: z.enum(['water', 'check', 'fertilize', 'prune', 'note', 'photo', 'analysis']),
        text: z.string().max(2000),
        createdAt: timestamp,
        demo: z.boolean(),
      }),
    )
    .max(50000),
});
export async function exportGarden() {
  const [plants, photos, entries] = await Promise.all([
    db.plants.toArray(),
    db.photos.toArray(),
    db.entries.toArray(),
  ]);
  return JSON.stringify({
    format: 'mumu-flowers',
    version: 1,
    exportedAt: new Date().toISOString(),
    plants,
    photos,
    entries,
  });
}
export async function importGarden(raw: string) {
  if (raw.length > 100 * 1024 * 1024) throw new Error('备份超过 100 MB，请拆分后导入');
  let data: z.infer<typeof backupSchema>;
  try {
    data = backupSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error('备份格式不正确或不受支持');
  }
  const ids = new Set(data.plants.map((p) => p.id));
  if (
    ids.size !== data.plants.length ||
    data.photos.some((p) => !ids.has(p.plantId)) ||
    data.entries.some((e) => !ids.has(e.plantId))
  )
    throw new Error('备份中的档案关联不完整');
  await db.transaction('rw', db.plants, db.photos, db.entries, async () => {
    await db.plants.bulkPut(data.plants.map((plant) => ({ ...plant, ...wateringPlan(plant) })));
    await db.photos.bulkPut(data.photos);
    await db.entries.bulkPut(data.entries);
  });
  return data.plants.length;
}
