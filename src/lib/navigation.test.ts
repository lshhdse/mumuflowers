import { describe, expect, test } from 'vitest';
import { defaultBottomMenus, normalizeBottomMenus } from './navigation';

describe('bottom menu preferences', () => {
  test('existing profiles without menu preferences receive the simplified defaults', () => {
    expect(normalizeBottomMenus(undefined)).toEqual(defaultBottomMenus);
    expect(normalizeBottomMenus(null)).toEqual(defaultBottomMenus);
    expect(normalizeBottomMenus('garden')).toEqual(defaultBottomMenus);
  });

  test('ignores unknown and duplicate entries and always keeps settings reachable', () => {
    expect(normalizeBottomMenus(['journal', 'plants', 'plants', 'unknown'])).toEqual([
      'plants',
      'journal',
      'my',
    ]);
    expect(normalizeBottomMenus([])).toEqual(['my']);
    expect(normalizeBottomMenus([null, 42, 'care'])).toEqual(['care', 'my']);
  });
});
