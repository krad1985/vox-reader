/* 追蹤 500 資源 + 以 BroadcastChannel 注入 CONTENT 進入 play 檢查控制列亂碼 */
const PW = 'C:/AIFILES/.opencode/skills/transcript-correction/scripts/chateverywhere/node_modules/playwright-core';
const { chromium } = require(PW);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://vox-reader-alpha.vercel.app';
const logs = [];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const p = await ctx.newPage();
  p.on('response', r => { if (r.status() >= 400) logs.push(`[HTTP ${r.status()}] ${r.request().method()} ${r.url()}`); });
  p.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  // 1) controller 頁，含 ?mode=controller
  await p.goto(BASE + '/?mode=controller', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(2500);
  logs.push(`[ctrl] head=${(await p.locator('body').innerText()).slice(0, 80).replace(/\n/g, '|')}`);

  // 2) display 頁另開，選模式 → 注入 CONTENT 進 play
  const d = await ctx.newPage();
  d.on('response', r => { if (r.status() >= 400) logs.push(`[disp HTTP ${r.status()}] ${r.request().method()} ${r.url()}`); });
  d.on('pageerror', e => logs.push(`[disp pageerror] ${e.message}`));
  await d.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await d.locator('button:has-text("講師模式")').first().click();
  await d.waitForTimeout(400);

  // 用另一個頁當「controller」廣播 CONTENT
  const fake = await ctx.newPage();
  await fake.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await fake.evaluate(() => {
    const bc = new BroadcastChannel('vox_reader_v3');
    bc.postMessage({
      t: 'CONTENT',
      src: 'fakecontroller',
      payload: {
        content: '<p>測試段落一。</p><p>測試段落二。</p>',
        lines: ['測試段落一', '測試段落二'],
        subs: ['測試段落一', '測試段落二'],
        starts: [0, 1],
      },
    });
    // HELLO 讓 display 判定 dual（若在 play）
    let n = 0;
    const iv = setInterval(() => { bc.postMessage({ t: 'HELLO', src: 'fakecontroller' }); if (++n > 10) clearInterval(iv); }, 900);
  });
  await d.waitForTimeout(2500);
  const dt = await d.locator('body').innerText();
  logs.push(`[disp after CONTENT] len=${dt.length} ${dt.slice(0, 250).replace(/\n/g, '|')}`);
  await d.screenshot({ path: 'scripts/p1-play-bar.png' });

  // 抓「雙螢幕控制中」按鈕的實際文字（DOM textContent 與畫素）
  const btnText = await d.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('button'));
    const b = bs.find(x => x.textContent.includes('螢幕') || x.textContent.includes('控制'));
    return b ? JSON.stringify({ text: b.textContent, cls: b.className }) : 'NOT FOUND: ' + bs.map(x => x.textContent).join(' / ');
  });
  logs.push(`[dual button] ${btnText}`);

  await d.waitForTimeout(2500); // 等 dual 偵測生效
  await d.screenshot({ path: 'scripts/p2-play-dual.png' });

  // 3) 重新整理 display（使用者情境）
  await d.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await d.waitForTimeout(3000);
  const rt = await d.locator('body').innerText();
  logs.push(`[disp reload] len=${rt.length} ${rt.slice(0, 250).replace(/\n/g, '|')}`);
  await d.screenshot({ path: 'scripts/p3-after-reload.png' });

  // 4) 連刷 5 次看是否哪次 500/空白
  for (let i = 0; i < 5; i++) {
    const resp = await d.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    logs.push(`[reload ${i}] status=${resp.status()} len=${(await d.locator('body').innerText()).length}`);
    await d.waitForTimeout(800);
  }

  console.log(logs.join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); console.log(logs.join('\n')); process.exit(1); });
