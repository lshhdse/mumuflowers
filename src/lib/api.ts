import { Capacitor } from '@capacitor/core';
import { db, uuid } from './db';
import type { Connection, Plant, Job, RemoteJob } from '../types';
import { submitDirectAnalysis, pollDirectJobs, retryDirectJob, cancelDirectJob } from './direct-ai';
export function loadConnection(): Connection {
  try {
    return JSON.parse(localStorage.getItem('mumu-connection') || '{"url":"","token":""}');
  } catch {
    return { url: '', token: '' };
  }
}
export function saveConnection(value: Connection) {
  const raw = value.url.trim().replace(/\/$/, '');
  if (raw) {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname))
    )
      throw new Error('手机服务地址需要 HTTPS；开发机可使用 localhost 或模拟器 10.0.2.2');
    if (url.username || url.password || url.search || url.hash)
      throw new Error('服务地址格式不正确');
  }
  localStorage.setItem('mumu-connection', JSON.stringify({ url: raw, token: value.token.trim() }));
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  connection = loadConnection(),
): Promise<T> {
  if (Capacitor.isNativePlatform() && !connection.url)
    throw new Error('此任务来自旧版服务，请回到植物档案重新分析');
  if (!connection.token) throw new Error('此任务来自旧版服务，请回到植物档案重新分析');
  try {
    const response = await fetch(`${connection.url}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.token}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(20000),
    });
    const raw = await response.text();
    let data: { error?: string };
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('服务响应无效，请检查后台服务地址');
    }
    if (!response.ok) throw new Error(data.error || `服务返回 ${response.status}`);
    return data as T;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('无法连接后台，请检查网络和服务地址');
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      throw new Error('连接超时，请稍后重试');
    throw error;
  }
}
export const submitAnalysis = submitDirectAnalysis;
async function submitLegacyAnalysis(plant: Plant): Promise<Job> {
  const current = await db.jobs
    .where('plantId')
    .equals(plant.id)
    .filter((j) => ['submitting', 'queued', 'running'].includes(j.status))
    .first();
  if (current) return current;
  const conn = loadConnection();
  const id = uuid();
  const job: Job = {
    id,
    plantId: plant.id,
    status: 'submitting',
    createdAt: Date.now(),
    applied: false,
    serviceUrl: conn.url,
  };
  await db.jobs.add(job);
  try {
    const photos = await db.photos.where('plantId').equals(plant.id).sortBy('createdAt');
    const latestPlant = photos.filter((p) => p.kind === 'plant').at(-1);
    const latestSoil = photos.filter((p) => p.kind === 'soil').at(-1);
    const image = latestPlant?.dataUrl || plant.cover;
    const asData = async (data: string) => {
      if (data.startsWith('data:')) return data;
      const blob = await (await fetch(data)).blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };
    const input = {
      id,
      name: plant.name,
      location: plant.location,
      notes: plant.notes,
      moisture: plant.moisture,
      lastWatered: plant.lastWateredAt ? new Date(plant.lastWateredAt).toISOString() : null,
      photos: [
        {
          kind: 'plant',
          createdAt: latestPlant?.createdAt || plant.createdAt,
          dataUrl: await asData(image),
        },
        ...(latestSoil
          ? [
              {
                kind: 'soil',
                createdAt: latestSoil.createdAt,
                dataUrl: await asData(latestSoil.dataUrl),
              },
            ]
          : []),
      ],
    };
    const remote = await api<RemoteJob>('/jobs', { method: 'POST', body: JSON.stringify(input) });
    await db.jobs.update(id, { status: remote.status });
    return { ...job, status: remote.status };
  } catch (error) {
    // A timed-out POST may still have been accepted. Retain the same ID; poll it before resubmitting.
    const message = error instanceof Error ? error.message : '提交失败';
    await db.jobs.update(id, { status: 'failed', error: message });
    throw error;
  }
}
let polling = false;
export async function pollJobs(onComplete?: (name: string) => void) {
  if (polling) return;
  polling = true;
  try {
    await pollDirectJobs(onComplete).catch(() => {});
    const connection = loadConnection();
    if (!connection.token) return;
    const jobs = await db.jobs
      .filter(
        (j) =>
          ['queued', 'running', 'submitting'].includes(j.status) && j.serviceUrl === connection.url,
      )
      .toArray();
    for (const job of jobs) {
      try {
        const remote = await api<RemoteJob>(`/jobs/${job.id}`);
        await db.transaction('rw', db.jobs, db.plants, db.entries, async () => {
          const fresh = await db.jobs.get(job.id);
          if (!fresh || fresh.applied) return;
          await db.jobs.update(job.id, {
            status: remote.status,
            error: remote.error || undefined,
            result: remote.result || undefined,
          });
          if (remote.status === 'done' && remote.result) {
            const plant = await db.plants.get(job.plantId);
            if (plant && (!plant.analysisAt || plant.analysisAt < job.createdAt)) {
              await db.plants.update(plant.id, {
                species: remote.result.commonName,
                health: remote.result.health,
                analysis: remote.result,
                analysisAt: job.createdAt,
                updatedAt: Date.now(),
              });
              await db.entries.put({
                id: `analysis-${job.id}`,
                plantId: plant.id,
                type: 'analysis',
                text: remote.result.summary,
                createdAt: Date.now(),
                demo: plant.demo,
              });
            }
            await db.jobs.update(job.id, { applied: true });
            if (plant) onComplete?.(plant.name);
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('任务已不存在'))
          await db.jobs.update(job.id, { status: 'failed', error: error.message });
      }
    }
  } finally {
    polling = false;
  }
}
export async function retryJob(job: Job) {
  if (job.serviceUrl === 'device') return retryDirectJob(job);
  if (job.serviceUrl !== loadConnection().url)
    throw new Error('此任务来自旧版服务，请回到植物档案重新分析');
  // Recover an accepted request before retrying, avoiding duplicate paid analyses after network loss.
  try {
    const remote = await api<RemoteJob>(`/jobs/${job.id}`);
    if (remote.status === 'failed')
      await api(`/jobs/${job.id}/retry`, { method: 'POST', body: '{}' });
    await db.jobs.update(job.id, {
      status: remote.status === 'failed' ? 'queued' : remote.status,
      error: undefined,
    });
    if (remote.status === 'done') {
      await db.jobs.update(job.id, { status: 'queued' });
      await pollJobs();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('任务已不存在')) {
      const plant = await db.plants.get(job.plantId);
      if (!plant) throw new Error('花卉档案不存在');
      await submitLegacyAnalysis(plant);
    } else throw error;
  }
}
export async function cancelJob(job: Job) {
  if (job.serviceUrl === 'device') return cancelDirectJob(job);
  await api(`/jobs/${job.id}`, { method: 'DELETE' });
  await db.jobs.update(job.id, { status: 'cancelled' });
}
