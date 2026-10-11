import type { MenuId } from '../types';

export const menuOptions: { id: MenuId; label: string; title: string; description: string }[] = [
  { id: 'garden', label: '花园', title: '我的花园', description: '查看植物、搜索和添加新植物' },
  { id: 'plants', label: '花册', title: '植物花册', description: '按位置筛选，查看收藏的植物' },
  { id: 'care', label: '养护', title: '养护提醒', description: '盆土检查、养护计划和 AI 任务' },
  { id: 'journal', label: '日记', title: '生长日记', description: '查看照片和每一次养护记录' },
  { id: 'my', label: '我的', title: '我的', description: '保留设置入口，随时调整菜单' },
];

export const defaultBottomMenus: MenuId[] = ['garden', 'care', 'my'];

export function normalizeBottomMenus(value: unknown): MenuId[] {
  if (!Array.isArray(value)) return [...defaultBottomMenus];
  return menuOptions
    .filter((menu) => menu.id === 'my' || value.includes(menu.id))
    .map((menu) => menu.id);
}
