/* 重現診斷：v3.0 重新整理後無法開啟 + 雙螢幕流程
 * 用本機 Chrome (headless) 跑，記錄 console/pageerror/network。
 */
const PW = 'C:/AIFILES/.opencode/skills/transcript-correction/scripts/chateverywhere/node_modules/playwright-core';
const { chromium } = require(PW);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://vox-reader-alpha.vercel.app';

const logs = [];
function attach(page, tag) {
  page.on('console', m => logs.push(`[${tag}][console.${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[${tag}][pageerror] ${e.message}\n${e.stack || ''}`));
  page.on('requestfailed', r => logs.push(`[${tag}][reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // === 1. 單一視窗：首頁 → 重新整理 ===
  const p1 = await ctx.newPage();
  attach(p1, 'p1');
  await p1.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  logs.push(`[p1] title=${await p1.title()} url=${p1.url()}`);
  await p1.waitForTimeout(1500);
  await p1.screenshot({ path: 'scripts/shot1-initial.png' });

  await p1.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await p1.waitForTimeout(1500);
  await p1.screenshot({ path: 'scripts/shot2-after-reload.png' });
  logs.push(`[p1] after reload bodyLen=${(await p1.content()).length}`);

  // === 2. 進入 controller 再重新整理（使用者重現步驟） ===
  const p2 = await ctx.newPage();
  attach(p2, 'ctrl');
  await p2.goto(BASE + '/?mode=controller', { waitUntil: 'networkidle', timeout: 30000 });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: 'scripts/shot3-controller.png' });
  logs.push(`[ctrl] stage-content: ${(await p2.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | ')}`);

  // controller 重新整理（localStorage 無 doc-url 時應進 setup；有則 loadDoc）
  await p2.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await p2.waitForTimeout(2000);
  await p2.screenshot({ path: 'scripts/shot4-controller-reload.png' });
  logs.push(`[ctrl] after reload: ${(await p2.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | ')}`);

  // === 3. 模擬雙螢幕：display 走完 Step1→Step2，看載入 ===
  const p3 = await ctx.newPage();
  attach(p3, 'disp');
  await p3.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  // Step 1 選講師模式
  const cards = p3.locator('button:has-text("講師模式")');
  if (await cards.count()) {
    await cards.first().click();
    await p3.waitForTimeout(600);
    logs.push(`[disp] step2: ${(await p3.locator('body').innerText()).slice(0, 150).replace(/\n/g, ' | ')}`);
    await p3.screenshot({ path: 'scripts/shot5-step2.png' });
  } else {
    logs.push('[disp] Step1 講師模式卡片找不到！body=' + (await p3.locator('body').innerText()).slice(0, 200));
    await p3.screenshot({ path: 'scripts/shot5-step1-missing.png' });
  }

  // === 4. 重新整理後的 p1 再檢查（隔一段時間後） ===
  await p1.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await p1.waitForTimeout(1000);
  const bodyText = await p1.locator('body').innerText();
  logs.push(`[p1] second reload body=${bodyText.slice(0, 200).replace(/\n/g, ' | ')}`);
  await p1.screenshot({ path: 'scripts/shot6-p1-reload2.png' });

  console.log(logs.join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); console.log(logs.join('\n')); process.exit(1); });
