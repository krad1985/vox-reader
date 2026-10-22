/* v3.4 驗收：小刀三件組（音檔欄位隱藏/提示/進度%）、章節目錄、手機遠端、上次載入 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

const BASE = 'https://vox-reader-alpha.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 內容含 3 個章節標題（帶 id，與 loadDoc 消毒迴圈賦值一致），且足夠長可捲動
const LONG_BODY = Array.from({ length: 40 }, (_, i) => `這是第${i + 1}段內容，用來產生足夠長度以便捲動與章節跳轉測試。`).join('');
const CONTENT_HTML =
  '<h1 id="vox-ch-0">第一章 緣起</h1><p>' + LONG_BODY.slice(0, 1500) + '</p>' +
  '<h1 id="vox-ch-1">第二章 正行</h1><p>' + LONG_BODY.slice(0, 1500) + '</p>' +
  '<h2 id="vox-ch-2">第三節 攝持</h2><p>' + LONG_BODY + '</p>';
const LINES = [
  '第一章 緣起', '這是第1段內容，用來產生足夠長度以便捲動與章節跳轉測試。',
  '第二章 正行', '這是第2段內容，用來產生足夠長度以便捲動與章節跳轉測試。',
  '第三節 攝持', '這是第3段內容，用來產生足夠長度以便捲動與章節跳轉測試。',
  '結尾句。',
];
const CHAPTERS = [
  { text: '第一章 緣起', level: 1, lineIdx: 0 },
  { text: '第二章 正行', level: 1, lineIdx: 2 },
  { text: '第三節 攝持', level: 2, lineIdx: 4 },
];
const PAYLOAD = {
  content: CONTENT_HTML,
  lines: LINES,
  subs: LINES.flatMap(l => [l]),
  starts: LINES.map((_, i) => i * 10),
  chapters: CHAPTERS,
};

const boot = async (page, mode, roleCtrl = false) => {
  await page.evaluate(({ p, m }) => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE999/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE999/edit', payload: p }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: m, idx: 0 }));
  }, { p: PAYLOAD, m: mode });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (roleCtrl) return;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const ok = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);

  // --- 1. 設定頁：A1 音檔欄位隱藏、A2 提示、黃帽上次載入 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    // 先進講師模式設定：音檔欄位應隱藏
    await page.evaluate(() => {
      localStorage.setItem('vox-last-load', JSON.stringify({ title: '測試文件標題', ts: Date.now() - 3600000 }));
      localStorage.removeItem('vox-doc-url');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('講師模式'));
      btn.click();
    });
    await page.waitForTimeout(300);
    let txt = await page.evaluate(() => document.body.innerText);
    ok('A1 presenter setup: no audio field label', !txt.includes('音檔連結'));
    ok('A2 empty URL: enable hint shown', txt.includes('請先貼上 Google 文件連結'));
    const btnDisabled = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('開始（單螢幕'));
      return btn ? btn.disabled && (btn.title || '').includes('請先貼上') : null;
    });
    ok('A2 start button disabled + title', btnDisabled === true, String(btnDisabled));

    // 回 Step 1 選閱覽模式：音檔欄位應出現
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('重選模式'));
      btn.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('閱覽模式'));
      btn.click();
    });
    await page.waitForTimeout(300);
    txt = await page.evaluate(() => document.body.innerText);
    ok('A1 reader setup: audio field visible', txt.includes('音檔連結'));
    ok('yellow: last-load hint shown', txt.includes('上次載入：測試文件標題'), '');
    await ctx.close();
  }

  // --- 2. 控制端閱覽模式：A3 進度%、章節側欄、SCROLL_CH 同步 ---
  {
    const ctx = await browser.newContext();
    const disp = await ctx.newPage();
    await disp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(disp, 'reader');
    const scrollable = await disp.evaluate(() => {
      const el = document.getElementById('reader-scroll');
      return el ? el.scrollHeight > el.clientHeight + 50 : false;
    });
    ok('reader content scrollable', scrollable);

    const ctrl = await ctx.newPage();
    await ctrl.goto(`${BASE}/?mode=controller`, { waitUntil: 'domcontentloaded' });
    await boot(ctrl, 'reader', true);
    await ctrl.waitForTimeout(1000);
    const ctrlTxt = await ctrl.evaluate(() => document.body.innerText);
    ok('A3 counter shows 進度 %', ctrlTxt.includes('進度') && ctrlTxt.includes('%'), ctrlTxt.match(/目前播放（[^）]*）/)?.[0] || '');
    ok('A3 no 字幕 in reader header', !ctrlTxt.includes('字幕'));
    ok('B controller has chapter TOC', ctrlTxt.includes('章節目錄') && ctrlTxt.includes('第二章 正行'));

    // display 前景，點控制端章節 → display scrollIntoView
    await disp.bringToFront();
    await disp.waitForTimeout(2000);
    await ctrl.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('第二章 正行'));
      btn.click();
    });
    await disp.waitForTimeout(1500);
    const jumped = await disp.evaluate(() => document.getElementById('reader-scroll').scrollTop);
    ok('B chapter click scrolls display', jumped > 100, `scrollTop=${jumped}`);

    // display 端 idx 同步（SCROLL_CH 後 sendState）
    const ctrlNow = await ctrl.evaluate(() => document.body.innerText);
    ok('B controller idx synced after chapter jump', ctrlNow.includes('第 3 段'), ctrlNow.match(/目前播放（[^）]*）/)?.[0] || '');
    await ctx.close();
  }

  // --- 3. 手機遠端：C remote 發送 → 單螢幕 display 接收 ---
  {
    const ctx = await browser.newContext();
    const disp = await ctx.newPage();
    await disp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(disp, 'presenter'); // 單螢幕講師：display 輪詢 /api/ctrl
    const lineBefore = await disp.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('z-20'));
      return el ? el.textContent : '';
    });

    const remote = await ctx.newPage();
    await remote.goto(`${BASE}/?mode=remote`, { waitUntil: 'domcontentloaded' });
    await remote.waitForTimeout(1500);
    const remoteTxt = await remote.evaluate(() => document.body.innerText);
    ok('C remote UI renders', remoteTxt.includes('VOX REMOTE') && remoteTxt.includes('下一句'));
    // 遠端不輪詢：不應出現 reader-scroll 等播放畫面（純面板）
    ok('remote is send-only panel', !remoteTxt.includes('句子清單'));

    await remote.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('下一句'));
      btn.click();
    });
    await disp.waitForTimeout(2000); // display 輪詢 700ms，留緩衝
    const lineAfter = await disp.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('z-20'));
      return el ? el.textContent : '';
    });
    ok('C remote next advances display line', lineBefore !== lineAfter && lineAfter.includes('第2句'), `${(lineBefore || '').slice(0, 12)} -> ${(lineAfter || '').slice(0, 12)}`);

    // 再按上一句回復
    await remote.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('上一句'));
      btn.click();
    });
    await disp.waitForTimeout(2000);
    const lineBack = await disp.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('z-20'));
      return el ? el.textContent : '';
    });
    ok('C remote prev goes back', (lineBack || '').includes('第1句'), (lineBack || '').slice(0, 12));
    await ctx.close();
  }

  // --- 4. display 閱覽模式目錄面板 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(page, 'reader');
    const tocBtn = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '目錄');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(400);
    const panelTxt = await page.evaluate(() => document.body.innerText);
    ok('B display TOC button + panel', tocBtn && panelTxt.includes('章節目錄') && panelTxt.includes('第三節 攝持'));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('第三節 攝持'));
      btn.click();
    });
    await page.waitForTimeout(1200);
    const top = await page.evaluate(() => document.getElementById('reader-scroll').scrollTop);
    ok('B display TOC click scrolls', top > 100, `scrollTop=${top}`);
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v3.4 ACCEPTANCE =====');
  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
