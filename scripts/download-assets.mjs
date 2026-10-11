import { mkdir, writeFile, stat } from 'node:fs/promises';
const files = {
  garden: 'photo-1416879595882-3373a0480b5b',
  hydrangea: 'photo-1490750967868-88aa4486c946',
  monstera: 'photo-1497250681960-ef046c08a56e',
  succulent: 'photo-1459411552884-841db9b3cc2a',
  flowers: 'photo-1457089328109-e5d9bd499191',
};
await mkdir('public/photos', { recursive: true });
await Promise.allSettled(
  Object.entries(files).map(async ([name, id]) => {
    const path = `public/photos/${name}.jpg`;
    if ((await stat(path).catch(() => ({ size: 0 }))).size > 5000) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(
          `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=85`,
          { signal: AbortSignal.timeout(20000) },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length < 5000) throw new Error('Too small');
        await writeFile(path, data);
        console.log(`${name}: ${data.length} bytes`);
        return;
      } catch (error) {
        if (attempt === 3) console.error(`${name}: ${error.message}`);
      }
    }
  }),
);
