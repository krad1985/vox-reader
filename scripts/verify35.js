/* v3.5 驗收：黑屏純黑覆蓋、Esc 停倒數、讀閱頁▶捲動、遠端重試去重 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

const BASE = 'https://vox-reader-alpha.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const LONG_BODY = Array.from({ length: 40 }, (_, i) => `這是第${i + 1}段內容，用來產生足夠長度以便捲動測試。`).join('');
const CONTENT_HTML =
  '<h1 id="vox-ch-0">第一章 緣起</h1><p>' + LONG_BODY.slice(0, 1500) + '</p>' +
  '<h1 id="vox-ch-1">第二章 正行</h1><p>' + LONG_BODY + '</p>';
const LINES = [
  '第一章 緣起',
  '這是第1段內容，用來產生足夠長度以便捲動測試。',
  '這是第2段內容，用來產生足夠長度以便捲動測試。',
  '這是第3段內容，用來產生足夠長度以便捲動測試。',
];
const PAYLOAD = {
  content: CONTENT_HTML,
  lines: LINES,
  subs: LINES.flatMap(l => [l]),
  starts: LINES.map((_, i) => i * 10),
  chapters: [
    { text: '第一章 緣起', level: 1, lineIdx: 0 },
    { text: '第二章 正行', level: 1, lineIdx: 2 },
  ],
};

const boot = async (page, mode) => {
  await page.evaluate(({ p, m }) => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE999/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE999/edit', payload: p }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: m, idx: 0 }));
  }, { p: PAYLOAD, m: mode });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
};

const lineText = page => page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('z-20'));
  return el ? el.textContent.trim() : '';
});

const clickBtn = (page, frag) => page.evaluate(f => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(f));
  if (!btn) return false;
  btn.click();
  return true;
}, frag);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const ok = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);

  // --- 1. 黑屏：全畫面純黑覆蓋，且控制列仍可點（不被覆蓋） ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(page, 'presenter');

    const clicked = await clickBtn(page, '黑屏 B');
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const el = document.getElementById('vox-black');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        vw: window.innerWidth, vh: window.innerHeight,
        bg: getComputedStyle(el).backgroundColor,
        z: getComputedStyle(el).zIndex,
      };
    });
    ok('black overlay exists & covers viewport', !!box && box.w >= box.vw && box.h >= box.vh, box ? `${box.w}x${box.h} vs ${box.vw}x${box.vh}` : 'missing');
    ok('black overlay is pure black', !!box && box.bg === 'rgb(0, 0, 0)', box ? box.bg : '');
    const barZ = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('黑屏 B'));
      if (!btn) return -1;
      let el = btn, z = 0;
      while (el) { const v = parseInt(getComputedStyle(el).zIndex); if (!isNaN(v) && v > z) z = v; el = el.parentElement; }
      return z;
    });
    ok('control bar above overlay', barZ >= 50, `barZ=${barZ}, overlay z=${box ? box.z : '?'}`);

    await clickBtn(page, '黑屏 B');
    await page.waitForTimeout(400);
    const gone = await page.evaluate(() => !document.getElementById('vox-black'));
    ok('black overlay toggles off', gone);
    await ctx.close();
  }

  // --- 2. 倒數 Esc：覆蓋關閉且倒數真正停止（不再跳秒） ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept('1'));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(page, 'presenter');

    await clickBtn(page, '倒數');
    await page.waitForTimeout(600);
    let txt = await page.evaluate(() => document.body.innerText);
    ok('countdown overlay shown', txt.includes('研討剩餘'));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const afterEsc = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '倒數');
      return { overlay: document.body.innerText.includes('研討剩餘'), btn: btn ? btn.textContent.trim() : '' };
    });
    ok('Esc closes countdown overlay', !afterEsc.overlay);
    ok('Esc clears timer on button', !/\d+:\d{2}/.test(afterEsc.btn), afterEsc.btn);

    // 等 2.5 秒確認倒數沒有在背景繼續、也沒有重新冒出來
    await page.waitForTimeout(2500);
    const later = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '倒數');
      return { overlay: document.body.innerText.includes('研討剩餘'), btn: btn ? btn.textContent.trim() : '' };
    });
    ok('countdown stays stopped after Esc', !later.overlay && !/\d+:\d{2}/.test(later.btn), later.btn);
    await ctx.close();
  }

  // --- 3. 閱覽模式「頁 ▶」按鈕與鍵盤真的捲動 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(page, 'reader');

    const before = await page.evaluate(() => document.getElementById('reader-scroll')?.scrollTop ?? -1);
    const clicked = await clickBtn(page, '頁 ▶');
    await page.waitForTimeout(1000);
    const afterClick = await page.evaluate(() => document.getElementById('reader-scroll')?.scrollTop ?? -1);
    ok('reader 頁▶ button exists', clicked);
    ok('reader 頁▶ scrolls content', afterClick > before + 20, `${before} -> ${afterClick}`);

    // 直到捲動區可用焦點，再測鍵盤
    await page.evaluate(() => document.getElementById('reader-scroll')?.focus());
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(900);
    const afterKey = await page.evaluate(() => document.getElementById('reader-scroll')?.scrollTop ?? -1);
    ok('reader keyboard scroll works', afterKey > afterClick + 10, `${afterClick} -> ${afterKey}`);
    await ctx.close();
  }

  // --- 4. 遠端重試去重：按一次只前進一句（不是三次）＋送出回饋 ---
  {
    const ctx = await browser.newContext();
    const disp = await ctx.newPage();
    await disp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await boot(disp, 'presenter');
    const before = await lineText(disp);

    const remote = await ctx.newPage();
    await remote.goto(`${BASE}/?mode=remote`, { waitUntil: 'domcontentloaded' });
    await remote.waitForTimeout(1200);
    const remoteTxt = await remote.evaluate(() => document.body.innerText);
    ok('remote shows v3.5', remoteTxt.includes('v3.5'));
    ok('remote explains usage order', remoteTxt.includes('使用順序'));

    await clickBtn(remote, '下一句');
    await remote.waitForTimeout(500);
    const feedback = await remote.evaluate(() => document.body.innerText);
    ok('remote shows send feedback', feedback.includes('已送出'), (feedback.split('\n').find(l => l.includes('已送出')) || '').slice(0, 30));

    // 等 4 秒：3 次重試（400ms 間隔）＋輪詢（600ms）全部落地
    await disp.waitForTimeout(4000);
    const afterOnce = await lineText(disp);
    ok('remote next deduped to exactly one advance', afterOnce.includes('第1段內容'), `${before.slice(0, 8)} -> ${afterOnce.slice(0, 10)}`);

    await clickBtn(remote, '下一句');
    await disp.waitForTimeout(4000);
    const afterTwice = await lineText(disp);
    ok('second click advances one more line', afterTwice.includes('第2段內容'), afterTwice.slice(0, 10));

    await clickBtn(remote, '上一句');
    await disp.waitForTimeout(4000);
    const afterPrev = await lineText(disp);
    ok('remote prev goes back one line', afterPrev.includes('第1段內容'), afterPrev.slice(0, 10));
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v3.5 ACCEPTANCE =====');
  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
