const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto('https://vox-reader-alpha.vercel.app/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    // 進到 setup：先選一個模式
    await p.evaluate(() => {
      localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/TEST/edit');
    });
    const btns = await p.$$('button');
    for (const bt of btns) {
      const t = await bt.innerText();
      if (t.includes('講師')) { await bt.click(); break; }
    }
    await p.waitForTimeout(500);
    const info = await p.evaluate(() => {
      const el = document.querySelector('input[type="text"]');
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor, bodyColor: getComputedStyle(document.body).color };
    });
    console.log(scheme, JSON.stringify(info));
    await ctx.close();
  }
  await b.close();
})();
