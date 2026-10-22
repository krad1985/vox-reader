const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));
const BASE = 'https://vox-reader-alpha.vercel.app';
const LONG_HTML = '<p>' + Array.from({ length: 60 }, (_, i) => `這是第${i + 1}段內容，用來產生足夠長度以便捲動測試。`).join('') + '</p>';
const PAYLOAD = { content: LONG_HTML, lines: Array.from({ length: 30 }, (_, i) => `第${i + 1}句。`), subs: ['字幕一。'], starts: Array.from({ length: 30 }, (_, i) => i * 10) };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext();
  const disp = await ctx.newPage();
  await disp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await disp.evaluate(({ p }) => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE999/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE999/edit', payload: p }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'reader', idx: 0 }));
  }, { p: PAYLOAD });
  await disp.reload({ waitUntil: 'domcontentloaded' });
  await disp.waitForTimeout(2000);

  // 掛 console listener 抓 display 端訊息
  await disp.evaluate(() => {
    window.__dbg = [];
    const bc = new BroadcastChannel('vox_reader_v3');
    bc.onmessage = (ev) => { window.__dbg.push(JSON.stringify(ev.data).slice(0, 120)); };
  });

  const ctrl = await ctx.newPage();
  await ctrl.goto(`${BASE}/?mode=controller`, { waitUntil: 'domcontentloaded' });
  await ctrl.evaluate(({ p }) => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE999/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE999/edit', payload: p }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'reader', idx: 0 }));
  }, { p: PAYLOAD });
  await ctrl.reload({ waitUntil: 'domcontentloaded' });
  await ctrl.waitForTimeout(2500);
  await disp.waitForTimeout(2000);

  const st = async () => disp.evaluate(() => document.getElementById('reader-scroll').scrollTop);
  console.log('start scrollTop:', await st());
  await ctrl.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('下一頁')).click());
  await disp.waitForTimeout(1500);
  console.log('after next:', await st());
  await ctrl.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('上一頁')).click());
  await disp.waitForTimeout(1500);
  console.log('after prev:', await st());
  const dbg = await disp.evaluate(() => window.__dbg);
  console.log('display received:', dbg.slice(-6));
  await browser.close();
})();
