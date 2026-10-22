const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.newContext()).newPage();
  await p.goto('https://vox-reader-alpha.vercel.app/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE123/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE123/edit', payload: { content: '<p>測試</p>', lines: ['測試字幕框樣式'], subs: ['測試字幕框樣式'], starts: [0] } }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'presenter', idx: 0 }));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const box = await p.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('backdrop-blur-3xl'));
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, borderTop: cs.borderTopWidth + ' ' + cs.borderTopColor };
  });
  console.log(JSON.stringify(box));
  await b.close();
})();
