const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));
const FAKE = { content: '<p>測試段落</p>', lines: ['測試段落'], subs: ['測試段落'], starts: [0] };
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.newContext()).newPage();
  await p.goto('https://vox-reader-alpha.vercel.app/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((f) => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/F/edit');
    localStorage.setItem('vox-cache', JSON.stringify({ url: 'https://docs.google.com/document/d/F/edit', payload: f }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'presenter', idx: 0 }));
  }, FAKE);
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => {
    window.__bc = new BroadcastChannel('vox_reader_v3');
    window.__hb = setInterval(() => window.__bc.postMessage({ t: 'HELLO', src: 'fake-ctrl' }), 700);
  });
  await p.waitForTimeout(4000);
  const info = await p.evaluate(() => {
    const el = document.querySelector('button[title="切回單螢幕控制"]');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { found: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, display: cs.display, visibility: cs.visibility, opacity: cs.opacity };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})();
