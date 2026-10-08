/* v3.1 驗收：#418、快取還原、角落圖示、CLOSE_CTRL、無舊文字 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

const BASE = 'https://vox-reader-alpha.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const FAKE_PAYLOAD = {
  content: '<p>驗收測試段落零一二三四五六七八九</p>',
  lines: ['驗收測試段落零一二三四五六七八九'],
  subs: ['驗收測試段落零一二三四五六七八九'],
  starts: [0],
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const ok = (name, pass, extra = '') => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };

  // --- 1. ?mode=controller 無 hydration #418 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${BASE}/?mode=controller`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const has418 = errors.some(e => e.includes('#418') || e.includes('Minified React error'));
    ok('controller no React #418', !has418, errors.length ? errors[0].slice(0, 120) : 'no pageerror');
    const txt = await page.evaluate(() => document.body.innerText);
    ok('controller renders (mode/setup/play)', txt.length > 0 && !txt.includes('雙螢幕控制中'));
    await ctx.close();
  }

  // --- 2. 快取+session 還原：reload 不打 fetch-doc，直接回 play ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // 首次載入：注入快取與 session（模擬上次播放中）
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ p }) => {
      localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE123/edit');
      localStorage.setItem('vox-cache', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE123/edit', payload: p }));
      sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'presenter', idx: 0 }));
    }, { p: FAKE_PAYLOAD });
    let fetchDocHits = 0;
    page.on('request', r => { if (r.url().includes('/api/fetch-doc')) fetchDocHits++; });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body.innerText);
    ok('reload restores play from cache', txt.includes('驗收測試段落零一二三四五六七八九'), `text=${JSON.stringify(txt.slice(0, 80))}`);
    ok('reload does NOT hit /api/fetch-doc', fetchDocHits === 0, `hits=${fetchDocHits}`);
    await ctx.close();
  }

  // --- 3. 角落圖示：注入 HELLO 出現圖示；點擊 → dual off + CLOSE_CTRL 廣播 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ p }) => {
      localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE123/edit');
      localStorage.setItem('vox-cache', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE123/edit', payload: p }));
      sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'presenter', idx: 0 }));
    }, { p: FAKE_PAYLOAD });
    // 模擬 controller 心跳
    await page.evaluate(() => {
      window.__bc = new BroadcastChannel('vox_reader_v3');
      window.__closeCtrlGot = false;
      window.__bc.onmessage = ev => { if (ev.data && ev.data.t === 'CLOSE_CTRL') window.__closeCtrlGot = true; };
      window.__hb = setInterval(() => window.__bc.postMessage({ t: 'HELLO', src: 'fake-ctrl' }), 700);
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    // 心跳要在 reload 後重新建立 —— reload 會清掉，重新注入
    await page.evaluate(() => {
      window.__bc = new BroadcastChannel('vox_reader_v3');
      window.__closeCtrlGot = false;
      window.__bc.onmessage = ev => { if (ev.data && ev.data.t === 'CLOSE_CTRL') window.__closeCtrlGot = true; };
      window.__hb = setInterval(() => window.__bc.postMessage({ t: 'HELLO', src: 'fake-ctrl' }), 700);
    });
    await page.waitForTimeout(3500);
    const iconVisible = await page.evaluate(() => {
      const el = document.querySelector('button[title="切回單螢幕控制"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    ok('corner icon appears when dual detected', iconVisible);
    // 舊文字不得存在
    const bodyTxt = await page.evaluate(() => document.body.innerText);
    ok('no 雙螢幕控制中 text', !bodyTxt.includes('雙螢幕控制中'));
    if (iconVisible) {
      await page.click('button[title="切回單螢幕控制"]');
      await page.waitForTimeout(1200);
      const gone = await page.evaluate(() => document.querySelectorAll('button[title="切回單螢幕控制"]').length === 0);
      ok('icon gone after click', gone);
      const got = await page.evaluate(() => window.__closeCtrlGot === true);
      ok('CLOSE_CTRL broadcast sent', got);
      const barVisible = await page.evaluate(() => {
        const bars = Array.from(document.querySelectorAll('div')).filter(d => d.className.includes('bg-black/90'));
        return bars.length > 0 && getComputedStyle(bars[0]).opacity === '1';
      });
      ok('single-screen bar back visible', barVisible);
      // 心跳持續但 dualOff 應維持 off（不重新出現）
      await page.waitForTimeout(3000);
      const stillGone = await page.evaluate(() => document.querySelectorAll('button[title="切回單螢幕控制"]').length === 0);
      ok('icon stays off despite continued HELLO (dualOff)', stillGone);
    }
    await ctx.close();
  }

  // --- 4. display reload 無 pageerror / 一般渲染正常 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const txt = await page.evaluate(() => document.body.innerText);
    ok('fresh load shows mode screen', txt.includes('選擇這次要用的模式') || txt.includes('Step 1'));
    ok('fresh load no pageerror', errors.length === 0, errors[0] ? errors[0].slice(0, 100) : '');
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v3.1 ACCEPTANCE =====');
  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
