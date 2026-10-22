const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('https://vox-reader-alpha.vercel.app/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  // 點講師模式卡片
  await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('講師模式'));
    btn.click();
  });
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => document.body.innerText.slice(0, 350));
  console.log(t);
  await p.screenshot({ path: 'scripts/ux3b-setup-presenter.png' });
  await b.close();
})();
