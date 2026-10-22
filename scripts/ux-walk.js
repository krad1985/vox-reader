/* Friday UX 走查：新用戶流程 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));
const BASE = 'https://vox-reader-alpha.vercel.app';

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // 1) 首屏（新用戶，無快取）
  const s1 = await page.evaluate(() => document.body.innerText);
  console.log('=== 首屏 ===');
  console.log(s1.slice(0, 500));
  await page.screenshot({ path: 'scripts/ux1-first.png' });

  // 2) 點閱覽模式 → setup
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('閱覽'));
    b.click();
  });
  await page.waitForTimeout(600);
  const s2 = await page.evaluate(() => document.body.innerText);
  console.log('\n=== Setup（閱覽） ===');
  console.log(s2.slice(0, 600));
  await page.screenshot({ path: 'scripts/ux2-setup-reader.png' });

  // 3) 換講師模式 setup
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('講師'));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  const s3 = await page.evaluate(() => document.body.innerText);
  console.log('\n=== Setup（講師） ===');
  console.log(s3.slice(0, 700));
  await page.screenshot({ path: 'scripts/ux3-setup-presenter.png' });

  // 4) 無網址時按鈕狀態
  const btnState = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('開始') || x.textContent.includes('載入'));
    return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
  });
  console.log('\n=== 開始按鈕（無網址） ===', JSON.stringify(btnState));

  // 5) 用假快取進 play（講師），看控制列
  await page.evaluate(() => {
    const p = { content: '<p>測試段落。</p>', lines: ['測試句子一。', '測試句子二。'], subs: ['字幕。'], starts: [0, 5] };
    localStorage.setItem('vox-doc-url', 'https://docs.google.com/document/d/FAKE/edit');
    localStorage.setItem('vox-cache-v3', JSON.stringify({ url: 'https://docs.google.com/document/d/FAKE/edit', payload: p }));
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'presenter', idx: 0 }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const s5 = await page.evaluate(() => document.body.innerText);
  console.log('\n=== 講師 play 控制列 ===');
  console.log(s5.slice(0, 400));
  await page.screenshot({ path: 'scripts/ux4-presenter-play.png' });

  // 控制列一列放得下嗎
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.shrink-0.z-50');
    return el ? { h: el.getBoundingClientRect().height, rows: el.querySelector('div').getBoundingClientRect().height } : null;
  });
  console.log('\n=== 控制列尺寸 ===', JSON.stringify(bar));

  // 6) 字幕模式 play 控制列
  await page.evaluate(() => {
    sessionStorage.setItem('vox-session', JSON.stringify({ stage: 'play', mode: 'overlay', idx: 0 }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const barO = await page.evaluate(() => {
    const el = document.querySelector('.shrink-0.z-50');
    return el ? { h: el.getBoundingClientRect().height } : null;
  });
  const s6 = await page.evaluate(() => document.body.innerText);
  console.log('\n=== 字幕 play 控制列 ===', JSON.stringify(barO));
  console.log(s6.slice(0, 350));
  await page.screenshot({ path: 'scripts/ux5-overlay-play.png' });

  await browser.close();
})();
