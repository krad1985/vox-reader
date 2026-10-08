/* 情境重現：已有 doc-url 的 localStorage → controller/display 重新整理 */
const PW = 'C:/AIFILES/.opencode/skills/transcript-correction/scripts/chateverywhere/node_modules/playwright-core';
const { chromium } = require(PW);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://vox-reader-alpha.vercel.app';
const logs = [];
function attach(page, tag) {
  page.on('console', m => logs.push(`[${tag}][${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[${tag}][pageerror] ${e.message}`));
  page.on('requestfailed', r => logs.push(`[${tag}][reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Seed localStorage：模擬「已經開過一次雙螢幕」的機器
  const seed = await ctx.newPage();
  await seed.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await seed.evaluate(() => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKEID123/edit?usp=sharing');
    localStorage.setItem('vox-font-size', '28');
    localStorage.setItem('vox-pres-w', '85');
  });
  await seed.close();

  // A. controller 重新整理（有 doc-url → boot 自動 loadDoc）
  const c = await ctx.newPage();
  attach(c, 'ctrl');
  await c.goto(BASE + '/?mode=controller', { waitUntil: 'networkidle', timeout: 30000 });
  await c.waitForTimeout(3000);
  logs.push(`[ctrl-A] ${(await c.locator('body').innerText()).slice(0, 300).replace(/\n/g, ' | ')}`);
  await c.screenshot({ path: 'scripts/r1-ctrl-first.png' });

  await c.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await c.waitForTimeout(4000);
  const t1 = await c.locator('body').innerText();
  logs.push(`[ctrl-reload] len=${t1.length} ${(t1).slice(0, 300).replace(/\n/g, ' | ')}`);
  await c.screenshot({ path: 'scripts/r2-ctrl-reload.png' });

  // 再刷三次
  for (let i = 0; i < 3; i++) {
    await c.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await c.waitForTimeout(2500);
    const t = await c.locator('body').innerText();
    logs.push(`[ctrl-reload${i + 2}] len=${t.length} head=${t.slice(0, 120).replace(/\n/g, ' | ')}`);
  }
  await c.screenshot({ path: 'scripts/r3-ctrl-reloadN.png' });

  // B. display 走完整流程到 play，再重新整理
  const d = await ctx.newPage();
  attach(d, 'disp');
  await d.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await d.locator('button:has-text("講師模式")').first().click();
  await d.waitForTimeout(500);
  // 填 doc url（種子已寫入，但輸入框由 state 讀 localStorage — 檢查是否已帶入）
  const inputVal = await d.locator('input[type=text]').first().inputValue();
  logs.push(`[disp] doc input value = "${inputVal}"`);
  if (!inputVal) await d.locator('input[type=text]').first().fill('https://docs.google.com/document/d/FAKEID123/edit');
  // 單螢幕開始
  await d.locator('button:has-text("開始（單螢幕")').click();
  await d.waitForTimeout(5000);
  const t2 = await d.locator('body').innerText();
  logs.push(`[disp-after-start] len=${t2.length} ${t2.slice(0, 300).replace(/\n/g, ' | ')}`);
  await d.screenshot({ path: 'scripts/r4-disp-play-or-error.png' });

  await d.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await d.waitForTimeout(3000);
  const t3 = await d.locator('body').innerText();
  logs.push(`[disp-reload] len=${t3.length} ${t3.slice(0, 300).replace(/\n/g, ' | ')}`);
  await d.screenshot({ path: 'scripts/r5-disp-reload.png' });

  console.log(logs.join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); console.log(logs.join('\n')); process.exit(1); });
