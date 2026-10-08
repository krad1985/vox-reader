/* v3.2 驗收：字幕高低可調、標點斷句、時鐘按鈕移除、控制器時間保留 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

const BASE = 'https://vox-reader-alpha.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const FAKE_PAYLOAD = {
  content: '<p>菩薩修學六度萬行，於一切境界中，安住於無所得的正觀，而利益有情眾生，不捨方便善巧。</p>',
  lines: ['菩薩修學六度萬行，於一切境界中，安住於無所得的正觀，而利益有情眾生，不捨方便善巧。'],
  subs: ['菩薩修學六度萬行，於一切境界中，', '安住於無所得的正觀，而利益有情眾生，', '不捨方便善巧。'],
  starts: [0],
};

const bootCache = async (page, mode = 'overlay') => {
  await page.evaluate(({ p, m }) => {
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE123/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE123/edit', payload: p }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: m, idx: 0 }));
  }, { p: FAKE_PAYLOAD, m: mode });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const ok = (name, pass, extra = '') => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };

  // --- 1. 字幕模式：預設置底6%，滑桿可調且即時反映在定位 style ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await bootCache(page, 'overlay');
    const txt = await page.evaluate(() => document.body.innerText);
    ok('overlay play renders subs (punctuation kept)', txt.includes('菩薩修學六度萬行，於一切境界中，'), JSON.stringify(txt.slice(0, 60)));

    const getPos = () => page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div')).filter(d => d.style && d.style.bottom && d.style.bottom.endsWith('%'));
      if (!els.length) return null;
      return { bottom: els[0].style.bottom, text: els[0].innerText.slice(0, 10) };
    });
    let pos = await getPos();
    ok('overlay positioned via bottom %', !!pos, JSON.stringify(pos));
    ok('default offset 6%', pos && pos.bottom === '6%', pos ? pos.bottom : 'n/a');

    const slider = await page.$('input[type="range"][max="45"]');
    ok('control-bar offset slider exists', !!slider);
    if (slider) {
      await slider.evaluate(el => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '30');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(300);
      pos = await getPos();
      ok('slider adjusts position to 30%', pos && pos.bottom === '30%', pos ? pos.bottom : 'n/a');
    }

    const toggle = await page.$('button:has-text("字幕置底")');
    ok('pos toggle button exists', !!toggle);
    if (toggle) {
      await toggle.click();
      await page.waitForTimeout(300);
      const topPos = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div')).filter(d => d.style && d.style.top && d.style.top.endsWith('%'));
        return els.length ? els[0].style.top : null;
      });
      ok('switch to top uses top %', topPos === '30%', String(topPos));
    }
    ok('overlay no pageerror', errors.length === 0, errors[0] ? errors[0].slice(0, 120) : '');
    await ctx.close();
  }

  // --- 2. 控制列與控制端皆無「時鐘」按鈕；控制器時間顯示保留 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await bootCache(page, 'presenter');
    const hasClockBtn = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '時鐘'));
    ok('display bar: no clock button', !hasClockBtn);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?mode=controller`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await bootCache(page, 'presenter');
    const txt = await page.evaluate(() => document.body.innerText);
    const hasClockBtn = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '時鐘'));
    ok('controller: no clock button', !hasClockBtn);
    const nowShown = await page.evaluate(() => /\d{2}:\d{2}:\d{2}/.test(document.body.innerText));
    ok('controller: current time still shown', nowShown, txt.slice(0, 80).replace(/\n/g, ' | '));
    const hasClockAction = await page.evaluate(() => document.body.innerHTML.includes('clock'));
    ok('controller: Companion clock action still listed', hasClockAction);
    await ctx.close();
  }

  // --- 3. 快取鍵 v3：優先讀 v3，不讀 v2 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ p }) => {
      localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE123/edit');
      localStorage.setItem('vox-cache-v2', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE123/edit', payload: p }));
      localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE123/edit', payload: { content: '<p>V3CACHEOK</p>', lines: ['V3CACHEOK'], subs: ['V3CACHEOK'], starts: [0] } }));
      sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'reader', idx: 0 }));
    }, { p: FAKE_PAYLOAD });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body.innerText);
    ok('reads vox-cache-v3 not v2', txt.includes('V3CACHEOK') && !txt.includes('菩薩修學'), JSON.stringify(txt.slice(0, 60)));
    await ctx.close();
  }

  // --- 4. 版本 v3.2 ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const txt = await page.evaluate(() => document.body.innerText);
    ok('version shows v3.2', txt.includes('v3.2'));
    await ctx.close();
  }

  await browser.close();
  console.log('\n===== v3.2 ACCEPTANCE =====');
  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
