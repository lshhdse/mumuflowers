import { useSyncExternalStore } from 'react';
import type { Profile } from '../types';

const darkQuery = '(prefers-color-scheme: dark)';
const systemDark = () => window.matchMedia(darkQuery).matches;
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(darkQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

export function resolveTheme(theme: Profile['theme']) {
  return theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
}

export function useResolvedTheme(theme: Profile['theme']) {
  const dark = useSyncExternalStore(subscribe, systemDark);
  return theme === 'system' ? (dark ? 'dark' : 'light') : theme;
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#17251e' : '#f6f7f2');
}
