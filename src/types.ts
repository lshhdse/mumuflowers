export type Health = 'healthy' | 'attention' | 'urgent' | 'unknown';
export type Moisture = 'dry' | 'moist' | 'wet' | 'unknown';
export interface Analysis {
  commonName: string;
  scientificName: string;
  confidence: 'high' | 'medium' | 'low';
  health: Health;
  summary: string;
  observations: string[];
  soil: { surface: Moisture; note: string };
  watering: { needsCheck: boolean; suggestedIntervalDays: number; advice: string };
  care: { light: string; temperature: string; fertilizer: string; pruning: string };
  warnings: string[];
}
export interface Plant {
  id: string;
  name: string;
  species: string;
  location: string;
  notes: string;
  cover: string;
  health: Health;
  moisture: Moisture;
  intervalDays: number;
  wateringIntervalDays: number;
  nextWaterAt: number;
  waterSnoozedUntil: number | null;
  nextCheckAt: number;
  lastWateredAt: number | null;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  demo: boolean;
  analysis?: Analysis;
  analysisAt?: number;
}
export interface Photo {
  id: string;
  plantId: string;
  dataUrl: string;
  kind: 'plant' | 'soil';
  createdAt: number;
  caption: string;
}
export interface Entry {
  id: string;
  plantId: string;
  type: 'water' | 'check' | 'fertilize' | 'prune' | 'note' | 'photo' | 'analysis';
  text: string;
  createdAt: number;
  demo: boolean;
}
export interface Job {
  id: string;
  plantId: string;
  status: 'submitting' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  createdAt: number;
  error?: string;
  applied: boolean;
  result?: Analysis;
  serviceUrl: string;
}
export type MenuId = 'garden' | 'plants' | 'care' | 'journal' | 'my';
export interface Profile {
  name: string;
  gardenName: string;
  notifications: boolean;
  reminderHour: number;
  theme: 'light' | 'dark' | 'system';
  bottomMenus: MenuId[];
}
export interface Connection {
  url: string;
  token: string;
}
export interface RemoteJob {
  id: string;
  status: Job['status'];
  result: Analysis | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface Release {
  version: string;
  notes: string;
  url: string;
  apkUrl: string | null;
  apkSize?: number;
  apkSha256?: string;
  publishedAt: string;
}
