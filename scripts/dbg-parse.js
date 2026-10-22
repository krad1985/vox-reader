const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.newContext()).newPage();
  await p.goto('https://vox-reader-alpha.vercel.app/', { waitUntil: 'domcontentloaded' });
  const r = await p.evaluate(() => {
    // 模擬 Google 登入/錯誤頁：無 #contents，body 內含 inline script
    const loginLike = `<html><head><title>登入 - Google 帳戶</title></head>
      <body><div class="wrapper">你需要存取權限</div>
      <script>var x="<div class=\\"outer\\">";function go(){return '<p>'}</script>
      </body></html>`;
    // 模擬正常 export：有 #contents，內容區含 style
    const okLike = `<html><head><style>.c1{color:red}</style></head>
      <body><div id="contents"><style>.c2{font-weight:bold}</style><p>第一句。</p><p>第二句。</p>
      <script>var y="<span>壞東西</span>";</script></div></body></html>`;
    const d1 = new DOMParser().parseFromString(loginLike, 'text/html');
    const t1 = d1.querySelector('#contents') || d1.body;
    const d2 = new DOMParser().parseFromString(okLike, 'text/html');
    const t2 = d2.querySelector('#contents') || d2.body;
    return {
      login_innerText: JSON.stringify(t1.innerText),
      login_textContent: JSON.stringify(t1.textContent),
      ok_innerText: JSON.stringify(t2.innerText),
      ok_textContent: JSON.stringify(t2.textContent),
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();
