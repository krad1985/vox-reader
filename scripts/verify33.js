/* v3.3 驗收：閱覽模式雙螢幕翻頁同步、講師離底高度 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

const BASE = 'https://vox-reader-alpha.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const LONG_HTML = '<p>' + Array.from({ length: 60 }, (_, i) => `這是第${i + 1}段內容，用來產生足夠長度以便捲動測試。`).join('') + '</p>';
const PAYLOAD = {
  content: LONG_HTML,
  lines: Array.from({ length: 30 }, (_, i) => `第${i + 1}句。`),
  subs: ['字幕一。', '字幕二。'],
  starts: Array.from({ length: 30 }, (_, i) => i * 10),
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

  // --- 1. 雙螢幕閱覽模式：display + controller 兩分頁，controller 下一頁 → display 捲動 ---
  {
    const ctx = await browser.newContext();
    const disp = await ctx.newPage();
    await disp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(disp, 'reader');
    const scrollable = await disp.evaluate(() => {
      const el = document.getElementById('reader-scroll');
      return el ? el.scrollHeight > el.clientHeight + 50 : false;
    });
    ok('reader page scrollable (long content)', scrollable);

    // 開 controller 分頁（同 context = 同 BroadcastChannel origin）
    const ctrl = await ctx.newPage();
    await ctrl.goto(`${BASE}/?mode=controller`, { waitUntil: 'domcontentloaded' });
    await boot(ctrl, 'reader', true);
    // controller 從快取還原 stage=play（session）
    const ctrlTxt = await ctrl.evaluate(() => document.body.innerText);
    ok('controller in play stage', ctrlTxt.includes('VOX CONTROLLER'), ctrlTxt.slice(0, 60).replace(/\n/g, '|'));
    ok('controller shows 上一頁/下一頁', ctrlTxt.includes('上一頁') && ctrlTxt.includes('下一頁'));

    // 等心跳被 display 偵測；display 必須在前景，smooth scroll 才不會被背景節流
    await disp.bringToFront();
    await ctrl.evaluate(() => { /* noop: keep ctrl ready */ });
    await disp.waitForTimeout(2000);
    const before = await disp.evaluate(() => document.getElementById('reader-scroll').scrollTop);
    await ctrl.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('下一頁'));
      btn.click();
    });
    await disp.waitForTimeout(1200);
    const after = await disp.evaluate(() => document.getElementById('reader-scroll').scrollTop);
    ok('controller 下一頁 scrolls display', after > before + 100, `scrollTop ${before} -> ${after}`);

    // 上一頁回捲
    await ctrl.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('上一頁'));
      btn.click();
    });
    await disp.waitForTimeout(1200);
    const back = await disp.evaluate(() => document.getElementById('reader-scroll').scrollTop);
    ok('controller 上一頁 scrolls back', back < after, `scrollTop ${after} -> ${back}`);

    // 點句子清單 → display 按比例跳轉
    await ctrl.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => /^\d+\./.test(b.textContent.trim()));
      if (btns.length > 20) btns[20].click();
    });
    await disp.waitForTimeout(1200);
    const jumped = await disp.evaluate(() => document.getElementById('reader-scroll').scrollTop);
    ok('sentence click = proportional jump', jumped > back, `scrollTop ${back} -> ${jumped}`);
    await ctx.close();
  }

  // --- 2. 講師模式離底高度 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(page, 'presenter');
    const getBottom = () => page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('transition-opacity') && d.className.includes('z-20'));
      return el ? el.style.bottom : null;
    });
    // 單螢幕：控制列常駐 → calc(5% + 40px)
    let b = await getBottom();
    ok('presenter default bottom = calc(5% + 40px)', b === 'calc(5% + 40px)', String(b));

    const slider = await page.$('input[type="range"][max="45"]');
    ok('presenter offset slider in control bar', !!slider);
    if (slider) {
      await slider.evaluate(el => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '25');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(300);
      b = await getBottom();
      ok('slider adjusts to 25%', b === 'calc(25% + 40px)', String(b));
    }
    // persist
    const stored = await page.evaluate(() => localStorage.getItem('vox-pres-offset'));
    ok('persisted to localStorage', stored === '25', String(stored));
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v3.3 ACCEPTANCE =====');
  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
