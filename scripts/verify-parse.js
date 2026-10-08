/* 驗證 loadDoc 解析邏輯：句子不得含程式碼殘渣 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '.opencode', 'skills', 'transcript-correction', 'scripts', 'chateverywhere', 'node_modules', 'playwright-core'));

const DOC = 'https://docs.google.com/document/d/1bsCJJrHphTxfO6V3Vkx8Y7VMYn_mVKQeVF8wWqcD-10/edit';
const BASE = 'https://vox-reader-alpha.vercel.app';

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.newContext()).newPage();

  // 抓 API 實際回傳
  const resp = await p.request.get(`${BASE}/api/fetch-doc?url=${encodeURIComponent(DOC)}`);
  const rawText = await resp.text();
  console.log(`API status=${resp.status()} len=${rawText.length} head=${JSON.stringify(rawText.slice(0, 40))}`);

  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  // 與 page.tsx loadDoc 相同的解析邏輯
  const out = await p.evaluate((raw) => {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, link, meta, iframe, object, embed, noscript, form, input, img, svg').forEach(el => el.remove());
    const target = doc.querySelector('#contents') || doc.querySelector('.doc-content') || doc.querySelector('.doc') || doc.body;
    if (!target) return { err: 'no target' };
    target.querySelectorAll('*').forEach(el => {
      el.removeAttribute('style'); el.removeAttribute('class'); el.removeAttribute('id');
      Array.from(el.attributes).forEach(a => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
    });
    const text = extractText(target).replace(/ /g, ' ');
    const sentences = text
      .replace(/([。！？．!?]+[」』）〕》”"』〕]*)/g, '$1\n')
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length > 1);
    const flat = []; const starts = [];
    const chunk = (s, n = 16) => {
      const out = []; let start = 0;
      while (start < s.length) {
        if (s.length - start <= n + 6) { out.push(s.slice(start)); break; }
        let cut = -1;
        const hi = Math.min(s.length, start + n + 6);
        const lo = start + Math.max(4, n - 4);
        for (let j = hi; j > lo; j--) { if ('，、；：,;：'.includes(s[j - 1])) { cut = j; break; } }
        if (cut === -1) cut = start + n;
        out.push(s.slice(start, cut)); start = cut;
      }
      return out;
    };
    sentences.forEach(s => { starts.push(flat.length); flat.push(...chunk(s)); });
    return { n: sentences.length, first5: sentences.slice(0, 5), firstChunks: flat.slice(0, 6), safeHtmlHead: target.innerHTML.slice(0, 300) };
    function extractText(root) {
      const BLOCKS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TR', 'BLOCKQUOTE', 'PRE', 'UL', 'OL']);
      let out = '';
      const walk = (n) => {
        if (n.nodeType === Node.TEXT_NODE) { out += n.nodeValue ?? ''; return; }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n;
        if (el.tagName === 'BR') { out += '\n'; return; }
        const block = BLOCKS.has(el.tagName);
        if (block) out += '\n';
        el.childNodes.forEach(walk);
        if (block) out += '\n';
      };
      walk(root);
      return out;
    }
  }, rawText);

  if (out.err) { console.log('FAIL', out.err); process.exit(1); }
  console.log(`sentences=${out.n}`);
  console.log('first5:', JSON.stringify(out.first5, null, 1));
  console.log('chunks:', JSON.stringify(out.firstChunks, null, 1));

  // 程式碼污染檢測
  const bad = (out.first5 || []).filter(s =>
    /function\s|var\s|window\.|document\.|=>|\{[a-z]|<script|nonce=|DOCS_|sendBeacon|\.lst-kix|counter\(/i.test(s));
  const codeChecks = [
    [/function\s*\(/, 'js function'],
    [/var\s+\w+\s*=/, 'js var'],
    [/window\[/, 'window[]'],
    [/\.lst-kix/, 'css class'],
    [/counter\(lst-/, 'css counter'],
    [/nonce=/, 'html attr'],
    [/=>/, 'arrow fn'],
  ];
  const allText = out.first5.join('\n');
  const hits = codeChecks.filter(([re]) => re.test(allText)).map(([, n]) => n);

  // safeHtml 不得含 script/style
  const hasScript = /<script|<style/i.test(out.safeHtmlHead);

  console.log(`\ncode pollution in sentences: ${hits.length ? hits.join(', ') : 'NONE'}`);
  console.log(`script/style in safeHtml: ${hasScript ? 'YES (FAIL)' : 'no'}`);
  console.log(`content looks real: ${out.n > 3 ? 'yes' : 'NO (too few sentences)'}`);

  const pass = hits.length === 0 && !hasScript && out.n > 3;
  console.log(`\n${pass ? 'PASS' : 'FAIL'}`);
  await b.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(2); });
