import { Capacitor, registerPlugin } from '@capacitor/core';
import { db, uuid, analysisSchema } from './db';
import type { Analysis, Job, Plant } from '../types';

export interface AiSettings {
  baseUrl: string;
  model: string;
  hasKey: boolean;
}
export interface AiInput {
  baseUrl: string;
  model: string;
  apiKey: string;
}
interface NativeJob {
  id: string;
  plantId: string;
  status: Job['status'];
  createdAt: number;
  updatedAt: number;
  error?: string;
  result?: Analysis;
}
const DirectAi = registerPlugin<{
  settings(): Promise<AiSettings>;
  save(input: AiInput): Promise<AiSettings>;
  test(input: AiInput): Promise<{ message: string }>;
  clearKey(): Promise<AiSettings>;
  start(input: { id: string; plantId: string; payload: unknown }): Promise<NativeJob>;
  jobs(options?: { ids: string[] }): Promise<{ jobs: NativeJob[] }>;
  cancel(input: { id: string }): Promise<void>;
}>('DirectAi');
export const directAiSupported = () => Capacitor.getPlatform() === 'android';
const defaults: AiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  hasKey: false,
};
export async function getAiSettings(): Promise<AiSettings> {
  if (directAiSupported()) return DirectAi.settings();
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem('mumu-ai-preview') || '{}'),
      hasKey: false,
    };
  } catch {
    return { ...defaults };
  }
}
export function validateAiInput(input: AiInput) {
  let url: URL;
  try {
    url = new URL(input.baseUrl.trim());
  } catch {
    throw new Error('请填写正确的服务 URL');
  }
  const local =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (
    (!local && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('服务 URL 需要 HTTPS，且不能包含密钥或查询参数');
  if (!input.model.trim() || input.model.trim().length > 120)
    throw new Error('请填写模型名称（最多 120 字符）');
  if (input.apiKey.length > 8192 || /[\r\n]/.test(input.apiKey.trim()))
    throw new Error('API Key 格式不正确');
  return {
    baseUrl: url.toString().replace(/\/+$/, ''),
    model: input.model.trim(),
    apiKey: input.apiKey.trim(),
  };
}
export async function saveAiSettings(input: AiInput) {
  const value = validateAiInput(input);
  if (directAiSupported()) return DirectAi.save(value);
  if (value.apiKey) throw new Error('请在安卓 App 中保存 API Key，浏览器只预览界面');
  localStorage.setItem(
    'mumu-ai-preview',
    JSON.stringify({ baseUrl: value.baseUrl, model: value.model }),
  );
  return { baseUrl: value.baseUrl, model: value.model, hasKey: false };
}
export async function testAiSettings(input: AiInput) {
  const value = validateAiInput(input);
  if (!directAiSupported()) throw new Error('请在安卓 App 中测试 AI 连接');
  return DirectAi.test(value);
}
export async function clearAiKey() {
  if (directAiSupported()) return DirectAi.clearKey();
  return getAiSettings();
}
async function imageData(data: string) {
  if (data.startsWith('data:')) return data;
  const response = await fetch(data);
  if (!response.ok) throw new Error('无法读取植物照片，请重新添加照片');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取照片'));
    reader.readAsDataURL(blob);
  });
}
export async function submitDirectAnalysis(plant: Plant): Promise<Job> {
  if (!directAiSupported()) throw new Error('请在安卓 App 中配置和使用 AI 分析');
  if (!(await getAiSettings()).hasKey)
    throw new Error('请先在「我的 → AI 配置」填写 URL、API Key 和模型');
  const existing = await db.jobs
    .where('plantId')
    .equals(plant.id)
    .filter((j) => ['submitting', 'queued', 'running'].includes(j.status))
    .first();
  if (existing) return existing;
  const photos = await db.photos.where('plantId').equals(plant.id).sortBy('createdAt');
  const latest = photos.filter((photo) => photo.kind === 'plant').at(-1);
  const soil = photos.filter((photo) => photo.kind === 'soil').at(-1);
  const payload = {
    plant: {
      name: plant.name,
      location: plant.location,
      notes: plant.notes,
      moisture: plant.moisture,
      lastWatered: plant.lastWateredAt ? new Date(plant.lastWateredAt).toISOString() : null,
    },
    photos: [
      {
        kind: 'plant',
        createdAt: latest?.createdAt || plant.createdAt,
        dataUrl: await imageData(latest?.dataUrl || plant.cover),
      },
      ...(soil
        ? [{ kind: 'soil', createdAt: soil.createdAt, dataUrl: await imageData(soil.dataUrl) }]
        : []),
    ],
  };
  const job: Job = {
    id: uuid(),
    plantId: plant.id,
    status: 'submitting',
    createdAt: Date.now(),
    applied: false,
    serviceUrl: 'device',
  };
  await db.jobs.add(job);
  try {
    const native = await DirectAi.start({ id: job.id, plantId: plant.id, payload });
    await db.jobs.update(job.id, { status: native.status });
    return { ...job, status: native.status };
  } catch (error) {
    await db.jobs.update(job.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : '分析未能开始',
    });
    throw error;
  }
}
export async function pollDirectJobs(onComplete?: (name: string) => void) {
  if (!directAiSupported()) return;
  const pending = await db.jobs
    .filter((job) => job.serviceUrl === 'device' && !job.applied)
    .toArray();
  if (!pending.length) return;
  const { jobs } = await DirectAi.jobs({ ids: pending.map((job) => job.id) });
  for (const local of pending) {
    const native = jobs.find((job) => job.id === local.id && job.plantId === local.plantId);
    if (!native) {
      if (Date.now() - local.createdAt > 30000)
        await db.jobs.update(local.id, {
          status: 'failed',
          error: '分析任务已中断，请点击重试',
          applied: true,
        });
      continue;
    }
    if (native.status === 'done') {
      const parsed = analysisSchema.safeParse(native.result);
      if (!parsed.success) {
        await db.jobs.update(local.id, {
          status: 'failed',
          applied: true,
          error: '模型返回格式不符合植物分析结构，请确认模型支持识图后重试',
        });
        continue;
      }
      let completedName = '';
      await db.transaction('rw', db.jobs, db.plants, db.entries, async () => {
        const fresh = await db.jobs.get(local.id);
        if (!fresh || fresh.applied || fresh.status === 'cancelled') return;
        const plant = await db.plants.get(local.plantId);
        if (plant && (!plant.analysisAt || plant.analysisAt < local.createdAt)) {
          await db.plants.update(plant.id, {
            species: parsed.data.commonName,
            health: parsed.data.health,
            analysis: parsed.data,
            analysisAt: local.createdAt,
            updatedAt: Date.now(),
          });
          await db.entries.put({
            id: `analysis-${local.id}`,
            plantId: plant.id,
            type: 'analysis',
            text: parsed.data.summary,
            createdAt: Date.now(),
            demo: plant.demo,
          });
          completedName = plant.name;
        }
        await db.jobs.update(local.id, {
          status: 'done',
          result: parsed.data,
          error: undefined,
          applied: true,
        });
      });
      if (completedName) onComplete?.(completedName);
    } else {
      await db.jobs.update(local.id, {
        status: native.status,
        error: native.error,
        applied: ['failed', 'cancelled'].includes(native.status),
      });
    }
  }
}
export async function retryDirectJob(job: Job) {
  const native = (await DirectAi.jobs({ ids: [job.id] })).jobs.find((row) => row.id === job.id);
  if (native && ['running', 'queued'].includes(native.status)) {
    await db.jobs.update(job.id, { status: native.status, error: undefined, applied: false });
    return;
  }
  if (native?.status === 'done' && !job.applied) {
    await pollDirectJobs();
    return;
  }
  const plant = await db.plants.get(job.plantId);
  if (!plant) throw new Error('植物档案不存在');
  await submitDirectAnalysis(plant);
}
export async function cancelDirectJob(job: Job) {
  await DirectAi.cancel({ id: job.id });
  await db.jobs.update(job.id, { status: 'cancelled', applied: true });
}
