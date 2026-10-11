import { expect, type Page } from '@playwright/test';

// Evaluate actual inherited colors and alpha-composited surfaces, including placeholders.
// Photo captions use a dedicated dark scrim and are verified separately from flat UI surfaces.
export async function readableText(page: Page, scope = 'body') {
  const failures = await page.locator(scope).evaluate((root) => {
    type Color = [number, number, number, number];
    const parse = (value: string): Color => {
      const channels = value.match(/[\d.]+/g)?.map(Number) || [];
      return [channels[0] || 0, channels[1] || 0, channels[2] || 0, channels[3] ?? 1];
    };
    const blend = (top: Color, bottom: Color): Color =>
      [...top.slice(0, 3).map((n, i) => n * top[3] + bottom[i] * (1 - top[3])), 1] as Color;
    const luminance = (color: Color) =>
      color
        .slice(0, 3)
        .map((n) => {
          const c = n / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const backgrounds = (element: Element): Color[] => {
      const chain: Element[] = [];
      for (let current: Element | null = element; current; current = current.parentElement)
        chain.unshift(current);
      let colors: Color[] = [[255, 255, 255, 1]];
      for (const ancestor of chain) {
        const style = getComputedStyle(ancestor);
        const background = parse(style.backgroundColor);
        colors = colors.map((color) => blend(background, color));
        // Worst endpoint of a UI gradient. Image labels are tested on their opaque scrim.
        const stops = style.backgroundImage.startsWith('linear-gradient')
          ? style.backgroundImage.match(/rgba?\([^)]+\)/g)?.map(parse)
          : undefined;
        if (stops?.length)
          colors = colors.flatMap((color) => stops.map((stop) => blend(stop, color)));
        if (colors.length > 16) colors = colors.slice(0, 16);
      }
      return colors;
    };
    const issues: {
      text: string;
      selector: string;
      ratio: number;
      color: string;
      background: Color;
    }[] = [];
    const check = (element: Element, text: string, placeholder = false) => {
      if (
        !text.trim() ||
        !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
        return;
      if (element.closest('[disabled], [aria-disabled="true"], svg, option, script, style')) return;
      if (element.closest('.growth-gallery, .demo-card-label, .detail-photo-grid')) return;
      const style = getComputedStyle(element, placeholder ? '::placeholder' : null);
      const foreground = parse(style.color);
      const required =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
          ? 3
          : 4.5;
      const samples = backgrounds(element);
      let ratio = Infinity;
      let worst = samples[0];
      for (const background of samples) {
        const a = luminance(blend(foreground, background)),
          b = luminance(background);
        const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (contrast < ratio) {
          ratio = contrast;
          worst = background;
        }
      }
      if (ratio < required)
        issues.push({
          text: text.trim().slice(0, 65),
          selector: `${element.tagName.toLowerCase()}.${element.className}`,
          ratio: Math.round(ratio * 100) / 100,
          color: style.color,
          background: worst,
        });
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement) check(node.parentElement, node.textContent || '');
    }
    root
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      )
      .forEach((input) => {
        if (input.type === 'hidden' || input.type === 'checkbox') return;
        if (input.value) check(input, input.value);
        else if ('placeholder' in input && input.placeholder) check(input, input.placeholder, true);
      });
    return issues;
  });
  expect(failures, `Unreadable text at ${page.url()}`).toEqual([]);
}
