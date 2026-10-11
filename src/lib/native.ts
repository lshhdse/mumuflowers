import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { Plant, Profile } from '../types';
import { careReminders } from './reminders';
const GalleryPicker = registerPlugin<{
  pick(): Promise<{ dataUrl?: string; cancelled?: boolean }>;
}>('GalleryPicker');
const LaunchScreen = registerPlugin<{
  ready(options: { reducedMotion: boolean }): Promise<void>;
  appearance(options: { dark: boolean }): Promise<void>;
}>('LaunchScreen');
export function syncAppearance(dark: boolean) {
  if (Capacitor.getPlatform() === 'android')
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
      .catch(() => {})
      .then(() => LaunchScreen.appearance({ dark }))
      .catch(() => {});
}
export function finishLaunch(reducedMotion = false) {
  if (Capacitor.getPlatform() === 'android')
    void LaunchScreen.ready({ reducedMotion }).catch(() => {});
}
export async function haptic() {
  if (Capacitor.isNativePlatform())
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
export async function compressPhoto(input: Blob): Promise<string> {
  if (input.size > 30 * 1024 * 1024) throw new Error('照片超过 30 MB，请选择较小的图片');
  const url = URL.createObjectURL(input);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1440 / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('此设备无法处理图片');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', 0.8);
    if (data.length > 1400000) data = canvas.toDataURL('image/jpeg', 0.55);
    if (data.length > 1800000) throw new Error('照片仍然过大，请选择其他图片');
    return data;
  } catch (error) {
    if (error instanceof Error && error.message.includes('照片')) throw error;
    throw new Error('无法读取此图片，请使用 JPG、PNG 或 WebP 格式');
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function nativePhoto(source: 'camera' | 'gallery') {
  if (source === 'gallery' && Capacitor.getPlatform() === 'android') {
    try {
      const selected = await GalleryPicker.pick();
      if (selected.cancelled) return null;
      if (!selected.dataUrl) throw new Error('没有获取到照片');
      return selected.dataUrl;
    } catch (error) {
      if ((error as { code?: string }).code !== 'NO_GALLERY') throw error;
      // Devices without a gallery use the system photo picker as a compatibility fallback.
    }
  }
  const result = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    quality: 85,
    width: 1440,
    correctOrientation: true,
  });
  if (!result.webPath) throw new Error('没有获取到照片');
  return compressPhoto(await (await fetch(result.webPath)).blob());
}
export async function enableNotifications(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: 'plant-care',
      name: '花园养护提醒',
      description: '检查盆土和照顾植物的温柔提醒',
      importance: 3,
      visibility: 1,
    });
    return true;
  }
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}
let reminderSync: Promise<void> = Promise.resolve();
export function syncReminders(plants: Plant[], profile: Profile) {
  reminderSync = reminderSync.catch(() => {}).then(() => syncRemindersOnce(plants, profile));
  return reminderSync;
}
async function syncRemindersOnce(plants: Plant[], profile: Profile) {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length)
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  if (!profile.notifications || (await LocalNotifications.checkPermissions()).display !== 'granted')
    return;
  const notifications = careReminders(plants, profile);
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}
export async function saveBackup(raw: string, filename: string) {
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: raw,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: 'MuMu Flowers 花园备份',
      files: [result.uri],
      dialogTitle: '保存花园备份',
    });
    return;
  }
  const file = new File([raw], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'MuMu Flowers 花园备份' });
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
