"use client";

import React, { useState, useEffect, useRef } from 'react';

type Mode = 'reader' | 'presenter' | 'overlay';
type Disc = 'none' | 'clock' | 'countdown' | 'class';
type Stage = 'mode' | 'setup' | 'play';

type SyncState = {
  idx: number; sub: number; hide: boolean; disc: Disc;
  cd: number | null; next: string; mode: Mode;
};

const MODE_META: Record<Mode, { title: string; desc: string; icon: string }> = {
  reader: { title: '閱覽模式', desc: '研讀用。直向捲動閱讀、可調字級與版寬、底部音檔列。', icon: '📖' },
  presenter: { title: '講師模式', desc: '投影用。講師背景圖＋毛玻璃字幕框，框寬高可調。', icon: '🖥️' },
  overlay: { title: '字幕模式', desc: '導播用。綠幕/黑幕單行字幕，每行固定 13–18 字。', icon: '🎞️' },
};

const getDirectAudioUrl = (url: string) => {
  if (url.includes('drive.google.com')) {
    const id = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
  }
  return url;
};

const chunkText = (s: string, n = 16): string[] => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmtCd = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
};

export default function VoxReader() {
  // 角色：display（預設單螢幕） / controller（控制端，/?mode=controller）
  const [role] = useState<'display' | 'controller'>(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'controller'
      ? 'controller' : 'display'
  );

  const [stage, setStage] = useState<Stage>('mode');
  const [mode, setMode] = useState<Mode>('presenter');

  // 設定
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800);
  const [presW, setPresW] = useState(90);
  const [presH, setPresH] = useState(30);
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');
  const [overlayBg, setOverlayBg] = useState('#00FF00');

  // 播放
  const [content, setContent] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [sub, setSub] = useState(0);
  const [hide, setHide] = useState(false);
  const [disc, setDisc] = useState<Disc>('none');
  const [cd, setCd] = useState<number | null>(null);
  const [nextClass, setNextClass] = useState('');
  const [now, setNow] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // 雙螢幕偵測（controller 心跳）
  const [dual, setDual] = useState(false);

  // Refs
  const bc = useRef<BroadcastChannel | null>(null);
  const tabId = useRef(Math.random().toString(36).slice(2));
  const startsRef = useRef<number[]>([]);
  const linesLenRef = useRef(0);
  const idxRef = useRef(0);
  const subRef = useRef(0);
  const hideRef = useRef(false);
  const discRef = useRef<Disc>('none');
  const cdRef = useRef<number | null>(null);
  const nextRef = useRef('');
  const modeRef = useRef<Mode>('presenter');
  const lastHelloRef = useRef(0);
  const stageRef = useRef<Stage>('mode');
  const dualRef = useRef(false);
  const contentRef = useRef({ content: '', lines: [] as string[], subs: [] as string[], starts: [] as number[] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const send = (msg: Record<string, unknown>) => bc.current?.postMessage({ ...msg, src: tabId.current });
  const sendState = (over: Partial<SyncState> = {}) => send({
    t: 'STATE',
    payload: {
      idx: idxRef.current, sub: subRef.current, hide: hideRef.current,
      disc: discRef.current, cd: cdRef.current, next: nextRef.current,
      mode: modeRef.current, ...over,
    },
  });
  const sendContent = () => {
    const c = contentRef.current;
    if (c.lines.length) send({ t: 'CONTENT', payload: c });
  };

  // ===== BroadcastChannel =====
  useEffect(() => {
    bc.current = new BroadcastChannel('vox_reader_v3');
    bc.current.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.src === tabId.current) return;
      if (m.t === 'HELLO') { lastHelloRef.current = Date.now(); return; }
      if (m.t === 'REQ') { if (role === 'controller') sendContent(); return; }
      if (m.t === 'CONTENT') {
        const p = m.payload;
        contentRef.current = p;
        startsRef.current = p.starts;
        linesLenRef.current = p.lines.length;
        setContent(p.content); setLines(p.lines); setSubs(p.subs);
        idxRef.current = Math.min(idxRef.current, p.lines.length - 1);
        subRef.current = startsRef.current[idxRef.current] ?? 0;
        setIdx(idxRef.current); setSub(subRef.current);
        setStage('play');
        return;
      }
      if (m.t === 'STATE') {
        const p = m.payload as SyncState;
        idxRef.current = p.idx; subRef.current = p.sub; hideRef.current = p.hide;
        discRef.current = p.disc; cdRef.current = p.cd; nextRef.current = p.next;
        modeRef.current = p.mode;
        setIdx(p.idx); setSub(p.sub); setHide(p.hide);
        setDisc(p.disc); setCd(p.cd); setNextClass(p.next); setMode(p.mode);
      }
    };
    return () => bc.current?.close();
  }, [role]);

  // controller 心跳 / display 偵測
  useEffect(() => {
    if (role !== 'controller') return;
    const iv = setInterval(() => send({ t: 'HELLO' }), 1000);
    send({ t: 'HELLO' });
    return () => clearInterval(iv);
  }, [role]);

  useEffect(() => {
    if (role !== 'display') return;
    const iv = setInterval(() => {
      const on = Date.now() - lastHelloRef.current < 2600;
      setDual(prev => prev !== on ? on : prev);
      dualRef.current = on;
    }, 800);
    return () => clearInterval(iv);
  }, [role]);

  // Ref 鏡像
  useEffect(() => {
    hideRef.current = hide; discRef.current = disc; cdRef.current = cd;
    nextRef.current = nextClass; modeRef.current = mode;
    stageRef.current = stage; dualRef.current = dual;
  });

  // 時鐘
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  // 倒數
  useEffect(() => {
    if (cd === null || cd <= 0) return;
    const t = setInterval(() => setCd(p => (p && p > 0 ? p - 1 : null)), 1000);
    return () => clearInterval(t);
  }, [cd]);

  // 設定載入 localStorage
  useEffect(() => {
    setDocUrl(localStorage.getItem('vox-doc-url') || '');
    setAudioUrl(localStorage.getItem('vox-audio-url') || '');
    setBgImageUrl(localStorage.getItem('vox-bg-url') || '');
    setContentWidth(parseInt(localStorage.getItem('vox-content-width') || '800'));
    setFontSize(parseInt(localStorage.getItem('vox-font-size') || '24'));
    setPresW(parseInt(localStorage.getItem('vox-pres-w') || '90'));
    setPresH(parseInt(localStorage.getItem('vox-pres-h') || '30'));
  }, []);

  // 控制端啟動：直接載入上次文件
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (role === 'controller') {
      const u = localStorage.getItem('vox-doc-url');
      if (u) { setDocUrl(u); loadDoc(u); }
      else setStage('setup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 內容載入 =====
  const loadDoc = async (url: string) => {
    if (!url) return;
    setLoading(true); setErrMsg('');
    localStorage.setItem('vox-doc-url', url);
    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(url)}`);
      const rawText = await res.text();
      const head = rawText.trimStart().slice(0, 1);
      if (head === '{' || head === '[') {
        // API 回了 JSON 錯誤，不是 HTML
        let msg = '讀取失敗';
        try { msg = JSON.parse(rawText).error || msg; } catch { /* keep */ }
        setErrMsg(msg); setLoading(false); return;
      }
      const doc = new DOMParser().parseFromString(rawText, 'text/html');
      const target = (doc.querySelector('#contents') || doc.body) as HTMLElement;
      if (!target) { setErrMsg('文件內容為空'); setLoading(false); return; }

      const text = target.innerText || target.textContent || '';
      const sentences = text.split(/[。\n！？]/).map(l => l.trim()).filter(l => l.length > 1);
      const flat: string[] = []; const starts: number[] = [];
      sentences.forEach(s => { starts.push(flat.length); flat.push(...chunkText(s)); });

      // 消毒：移除危險/無關標籤與屬性，再重新序列化（保證標籤封閉）
      target.querySelectorAll('script, style, link, meta, iframe, object, embed, form, input, img, svg, noscript').forEach(el => el.remove());
      target.querySelectorAll('*').forEach(el => {
        const e = el as HTMLElement;
        e.removeAttribute('style'); e.removeAttribute('class'); e.removeAttribute('id');
        // 去掉 on* 事件屬性
        Array.from(e.attributes).forEach(a => { if (/^on/i.test(a.name)) e.removeAttribute(a.name); });
      });
      const safeHtml = target.innerHTML; // DOMParser 已自動補閉合標籤

      const payload = { content: safeHtml, lines: sentences, subs: flat, starts };
      contentRef.current = payload;
      startsRef.current = starts;
      linesLenRef.current = sentences.length;
      idxRef.current = 0; subRef.current = 0;
      setContent(safeHtml); setLines(sentences); setSubs(flat);
      setIdx(0); setSub(0);
      setStage('play');
      if (role === 'controller') setTimeout(sendContent, 50);
    } catch {
      setErrMsg('載入發生例外，請檢查連結');
    } finally {
      setLoading(false);
    }
  };

  // display 進入播放時，向 controller 要內容
  useEffect(() => {
    if (stage === 'play' && role === 'display') send({ t: 'REQ' });
  }, [stage, role]);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onloadend = () => { setBgImageUrl(r.result as string); localStorage.setItem('vox-bg-url', r.result as string); };
    r.readAsDataURL(file);
  };

  // ===== 動作 =====
  const gotoLine = (i: number) => {
    const n = Math.max(0, Math.min(linesLenRef.current - 1, i));
    const s = startsRef.current[n] ?? 0;
    idxRef.current = n; subRef.current = s;
    setIdx(n); setSub(s);
    sendState({ idx: n, sub: s });
  };
  const nextLine = () => gotoLine(idxRef.current + 1);
  const prevLine = () => gotoLine(idxRef.current - 1);

  const gotoSub = (s: number) => {
    const starts = startsRef.current;
    const max = starts.length ? starts[starts.length - 1] + 100 : 0;
    const n = Math.max(0, Math.min(max, s));
    let i = idxRef.current;
    while (i < linesLenRef.current - 1 && starts[i + 1] <= n) i++;
    while (i > 0 && n < starts[i]) i--;
    idxRef.current = i; subRef.current = n;
    setIdx(i); setSub(n);
    sendState({ idx: i, sub: n });
  };

  const toggleHide = () => {
    const v = !hideRef.current; hideRef.current = v; setHide(v); sendState({ hide: v });
  };
  const setDiscSync = (d: Disc) => { discRef.current = d; setDisc(d); sendState({ disc: d }); };
  const startCountdown = () => {
    const m = prompt('研討倒數幾分鐘？', '10');
    if (!m || isNaN(parseInt(m))) return;
    const sec = parseInt(m) * 60;
    cdRef.current = sec; setCd(sec);
    discRef.current = 'countdown'; setDisc('countdown');
    sendState({ cd: sec, disc: 'countdown' });
  };
  const setClassSync = () => {
    const t = prompt('下堂課時間（HH:MM）', '14:00');
    if (!t) return;
    nextRef.current = t; setNextClass(t);
    discRef.current = 'class'; setDisc('class');
    sendState({ next: t, disc: 'class' });
  };
  const switchMode = (m: Mode) => { modeRef.current = m; setMode(m); sendState({ mode: m }); };

  const applyAction = (a: string) => {
    if (stageRef.current !== 'play') return;
    if (a === 'next') (modeRef.current === 'overlay' && stageRef.current === 'play') ? gotoSub(subRef.current + 1) : nextLine();
    else if (a === 'prev') prevLine();
    else if (a === 'black') toggleHide();
    else if (a === 'clock') setDiscSync('clock');
    else if (a === 'off') setDiscSync('none');
    else if (a.startsWith('countdown:')) {
      const sec = parseInt(a.split(':')[1]) * 60;
      if (!isNaN(sec)) { cdRef.current = sec; setCd(sec); discRef.current = 'countdown'; setDisc('countdown'); sendState({ cd: sec, disc: 'countdown' }); }
    } else if (a.startsWith('class:')) {
      const t = a.split(':')[1];
      if (t) { nextRef.current = t; setNextClass(t); discRef.current = 'class'; setDisc('class'); sendState({ next: t, disc: 'class' }); }
    } else if (a.startsWith('mode:')) {
      const m = a.split(':')[1] as Mode;
      if (m === 'reader' || m === 'presenter' || m === 'overlay') switchMode(m);
    } else if (a.startsWith('goto:')) {
      const n = parseInt(a.split(':')[1]);
      if (!isNaN(n)) gotoLine(n - 1);
    }
  };
  const applyRef = useRef(applyAction);
  applyRef.current = applyAction;

  // ===== Bitfocus Companion 指令輪詢 =====
  // controller 永遠輪詢；display 僅在單螢幕（無 controller）時輪詢，避免重複執行
  useEffect(() => {
    let since = 0;
    const iv = setInterval(async () => {
      if (stageRef.current !== 'play') return;
      const shouldPoll = role === 'controller' || !dualRef.current;
      if (!shouldPoll) return;
      try {
        const r = await fetch(`/api/ctrl?key=vox-reader&since=${since}`);
        if (!r.ok) return;
        const d = await r.json();
        (d.acts || []).forEach((a: { id: number; action: string }) => {
          since = Math.max(since, a.id);
          applyRef.current(a.action);
        });
      } catch { /* network hiccup */ }
    }, 700);
    return () => clearInterval(iv);
  }, [role]);

  // ===== 快速鍵 =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stageRef.current !== 'play') return;
      const k = e.key;
      if (k === 'b' || k === 'B') { toggleHide(); return; }
      if (k === 'Escape') { setDiscSync('none'); return; }
      if (k === 'q' || k === 'Q') { setStage('mode'); return; }
      if (modeRef.current === 'reader' && role === 'display') {
        const el = document.getElementById('reader-scroll');
        if (k === 'ArrowDown' || k === ' ') { e.preventDefault(); (el || window).scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); }
        if (k === 'ArrowUp') { e.preventDefault(); (el || window).scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); }
        return;
      }
      if (k === 'ArrowRight' || k === ' ' || k === 'Enter') { e.preventDefault(); modeRef.current === 'overlay' ? gotoSub(subRef.current + 1) : nextLine(); }
      if (k === 'ArrowLeft' || k === 'Backspace') { e.preventDefault(); prevLine(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // 上課剩餘分鐘
  const remainMin = (() => {
    const m = nextClass.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(); const t = new Date(d);
    t.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
    if (t.getTime() <= d.getTime()) t.setDate(t.getDate() + 1);
    return Math.round((t.getTime() - d.getTime()) / 60000);
  })();

  const persist = () => {
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-font-size', String(fontSize));
    localStorage.setItem('vox-content-width', String(contentWidth));
    localStorage.setItem('vox-pres-w', String(presW));
    localStorage.setItem('vox-pres-h', String(presH));
  };

  // ===== 控制端控制列（Companion 對接說明） =====
  const COMPANION = typeof window !== 'undefined' ? `${window.location.origin}/api/ctrl?key=vox-reader&action=` : '';

  // ================= 渲染 =================

  // --- Stage: MODE（先選模式） ---
  if (stage === 'mode') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#f0f2f5] font-sans gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter italic">VoxReader Pro <span className="text-blue-500">v3.0</span></h1>
          <p className="text-slate-400 font-bold mt-2 text-sm">Step 1 / 2 — 選擇這次要用的模式</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {(Object.keys(MODE_META) as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); modeRef.current = m; setStage('setup'); }}
              className="bg-white p-8 rounded-[2.5rem] shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all text-left group">
              <div className="text-5xl mb-4">{MODE_META[m].icon}</div>
              <div className="text-xl font-black text-slate-800">{MODE_META[m].title}</div>
              <div className="text-sm text-slate-400 mt-2 leading-relaxed">{MODE_META[m].desc}</div>
              <div className="text-[10px] font-black text-blue-600 mt-4 group-hover:tracking-widest transition-all">選擇此模式 →</div>
            </button>
          ))}
        </div>
        {role === 'controller' && <p className="text-xs text-red-400 font-bold">控制端需要先在顯示端設定文件，或於下一步輸入連結。</p>}
      </div>
    );
  }

  // --- Stage: SETUP ---
  if (stage === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f0f2f5] font-sans">
        <div className="w-full max-w-4xl bg-white shadow-2xl rounded-[3rem] overflow-hidden">
          <div className="px-12 pt-10 pb-4">
            <button onClick={() => setStage('mode')} className="text-xs font-black text-slate-400 hover:text-blue-600">← Step 1 重選模式</button>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter italic mt-3">
              {MODE_META[mode].title} <span className="text-blue-500 text-lg align-middle">v3.0</span>
            </h1>
            <p className="text-slate-400 font-bold mt-1 text-sm">Step 2 / 2 — 設定內容與版面</p>
          </div>

          <div className="px-12 pb-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase">Google 文件連結 *</label>
                <input type="text" value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://docs.google.com/..."
                  className="w-full mt-1 p-4 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase">音檔連結（閱覽模式底部列）</label>
                <input type="text" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="mp3 / Google Drive 連結"
                  className="w-full mt-1 p-4 bg-slate-50 rounded-2xl outline-none" />
              </div>

              {mode === 'presenter' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">講師背景圖片</label>
                  <div onClick={() => fileInputRef.current?.click()}
                    className="mt-1 w-full h-36 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-blue-50 transition overflow-hidden">
                    {bgImageUrl ? <img src={bgImageUrl} className="w-full h-full object-cover" alt="BG" /> : <span className="text-slate-400 font-bold">點擊上傳圖片</span>}
                    <input type="file" ref={fileInputRef} onChange={handleImage} className="hidden" accept="image/*" />
                  </div>
                </div>
              )}

              {mode === 'overlay' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">字幕位置</label>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setOverlayPos('bottom')} className={`flex-1 p-3 rounded-xl text-xs font-black ${overlayPos === 'bottom' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>置底</button>
                      <button onClick={() => setOverlayPos('top')} className={`flex-1 p-3 rounded-xl text-xs font-black ${overlayPos === 'top' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>置頂</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">背景色（綠幕/黑幕）</label>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setOverlayBg('#00FF00')} className={`flex-1 p-3 rounded-xl text-xs font-black ${overlayBg === '#00FF00' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>綠幕</button>
                      <button onClick={() => setOverlayBg('#000000')} className={`flex-1 p-3 rounded-xl text-xs font-black ${overlayBg === '#000000' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>黑幕</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400">字級 {fontSize}px</label>
                  <input type="range" min="16" max="60" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full accent-blue-600" />
                </div>
                {mode === 'reader' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400">版寬 {contentWidth}px</label>
                    <input type="range" min="400" max="2000" value={contentWidth} onChange={e => setContentWidth(parseInt(e.target.value))} className="w-full accent-blue-600" />
                  </div>
                )}
              </div>

              {mode === 'presenter' && (
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400">字幕框寬度 / 高度（播放中控制列也可即時調）</label>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-400 w-14">寬 {presW}%</span>
                    <input type="range" min="30" max="100" value={presW} onChange={e => setPresW(parseInt(e.target.value))} className="flex-1 accent-blue-600" />
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-400 w-14">高 {presH}%</span>
                    <input type="range" min="10" max="80" value={presH} onChange={e => setPresH(parseInt(e.target.value))} className="flex-1 accent-blue-400" />
                  </div>
                </div>
              )}

              {errMsg && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600 font-bold leading-relaxed">
                  {errMsg}
                  <div className="text-[11px] text-red-400 mt-1 font-normal">
                    常見原因：文件分享權限不足。請設為「知道連結的檢視者」，若文件勾選了「禁止檢視者下載/列印」會被 Google 拒絕（401）。
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button onClick={() => { persist(); loadDoc(docUrl); }} disabled={loading || !docUrl}
                  className="w-full p-5 bg-blue-600 text-white rounded-3xl font-black hover:bg-blue-500 transition shadow-xl disabled:opacity-40">
                  {loading ? '載入中…' : role === 'controller' ? '載入並開啟控制端' : `開始（單螢幕，常駐控制列）`}
                </button>
                {role === 'display' && (
                  <button onClick={() => {
                    persist();
                    window.open('/?mode=controller', '_blank');
                    loadDoc(docUrl);
                  }} disabled={loading || !docUrl}
                    className="w-full p-5 bg-slate-800 text-white rounded-3xl font-black hover:bg-slate-700 transition disabled:opacity-40">
                    開始（雙螢幕：另開控制端視窗）
                  </button>
                )}
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  單螢幕＝畫面底部常駐控制列，自己控制自己。雙螢幕＝同一台電腦開兩個視窗（控制端全螢幕外的另一螢），控制端按鈕會同步投影端；控制端一關，投影端自動回到單螢幕控制列。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Stage: PLAY — 控制端 UI =====
  if (role === 'controller') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-8 flex flex-col space-y-5 select-none font-sans">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-black tracking-tighter italic">VOX <span className="text-blue-500">CONTROLLER</span> <span className="text-[9px] text-slate-600 ml-2">v3.0</span></h1>
          <div className="flex items-center space-x-6">
            {nextClass && (
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase">下堂課 {nextClass}</div>
                <div className="text-lg font-mono text-blue-400">{now}</div>
              </div>
            )}
            {!nextClass && <div className="text-right"><div className="text-[10px] text-slate-500 uppercase">現在</div><div className="text-lg font-mono">{now}</div></div>}
            <button onClick={() => setStage('setup')} className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold hover:bg-red-900 transition">退出</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-h-0">
          <div className="md:col-span-2 space-y-5 flex flex-col">
            <div className="bg-slate-800 p-6 rounded-[2rem] border border-slate-700">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                目前播放（{idx + 1}/{lines.length}｜字幕 {sub + 1}/{subs.length}）
              </div>
              <div className="text-2xl font-bold mt-3 leading-relaxed">{lines[idx] || '---'}</div>
              <div className="text-sm text-blue-400 mt-3 font-bold italic">下一句：{lines[idx + 1] || '（最後一句）'}</div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <button onClick={toggleHide} className={`p-5 rounded-3xl font-black ${hide ? 'bg-red-600' : 'bg-slate-800 hover:bg-slate-700'}`}>黑屏<span className="block text-[9px] opacity-50">B</span></button>
              <button onClick={startCountdown} className={`p-5 rounded-3xl font-black ${disc === 'countdown' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>研討倒數{cd !== null && cd > 0 && <span className="block text-[11px] text-blue-300">{fmtCd(cd)}</span>}</button>
              <button onClick={setClassSync} className={`p-5 rounded-3xl font-black ${disc === 'class' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>上課提醒{nextClass && <span className="block text-[11px] text-blue-300">{nextClass}</span>}</button>
            </div>

            <div className="flex space-x-3">
              <button onClick={prevLine} className="flex-1 p-6 bg-slate-800 rounded-[2rem] text-2xl hover:bg-slate-700 active:scale-95 transition">◀ 上一句</button>
              <button onClick={() => mode === 'overlay' ? gotoSub(sub + 1) : nextLine()} className="flex-[2] p-6 bg-blue-600 rounded-[2rem] text-2xl font-black hover:bg-blue-500 active:scale-95 transition shadow-2xl shadow-blue-900/50">下一句 ▶</button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(['presenter', 'overlay', 'reader'] as Mode[]).map(m => (
                <button key={m} onClick={() => switchMode(m)} className={`px-4 py-2 rounded-xl text-xs font-black ${mode === m ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>{MODE_META[m].title}</button>
              ))}
              <button onClick={() => setDiscSync('clock')} className={`px-4 py-2 rounded-xl text-xs font-black ${disc === 'clock' ? 'bg-blue-600' : 'bg-slate-800'}`}>時鐘</button>
              <button onClick={() => setDiscSync('none')} className="px-4 py-2 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700">關閉覆蓋 Esc</button>
            </div>

            <details className="bg-slate-800/60 rounded-2xl p-4 text-[11px] text-slate-400">
              <summary className="cursor-pointer font-black text-slate-300 text-xs">Bitfocus Companion 對接（HTTP 指令）</summary>
              <p className="mt-2 leading-relaxed">在 Companion 的按鈕加「Open URL / HTTP Request」指向下列網址（key 固定為 vox-reader）：</p>
              <div className="mt-2 space-y-1 font-mono break-all">
                {['next', 'prev', 'black', 'clock', 'off', 'countdown:10', 'class:14:00', 'mode:presenter', 'mode:overlay', 'mode:reader', 'goto:5'].map(a => (
                  <div key={a} className="bg-slate-900 rounded px-2 py-1">{COMPANION}{a}</div>
                ))}
              </div>
              <p className="mt-2 leading-relaxed">控制端開著時由控制端接收指令並同步投影端；只用單螢幕時由投影端自行接收。</p>
            </details>
          </div>

          <div className="bg-slate-800 rounded-[2rem] overflow-hidden flex flex-col border border-slate-700 min-h-0">
            <div className="p-4 bg-slate-700 text-[10px] font-bold uppercase tracking-widest text-slate-400">句子清單（點擊跳轉）</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {lines.map((l, i) => (
                <button key={i} onClick={() => gotoLine(i)} className={`w-full text-left p-3 rounded-xl text-xs transition ${i === idx ? 'bg-blue-600' : 'hover:bg-slate-700 text-slate-400'}`}>{i + 1}. {l.substring(0, 30)}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Stage: PLAY — 顯示端 =====
  const barVisible = !dual; // 單螢幕常駐；雙螢幕時控制列讓位（滑鼠移到底部仍可浮出）

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ backgroundColor: mode === 'overlay' ? overlayBg : '#111' }}>

      {/* 討論覆蓋 */}
      {disc !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
          <div className="text-center w-full px-20">
            {disc === 'countdown' && (
              <div>
                <div className="text-slate-500 text-2xl font-bold tracking-[0.4em] uppercase mb-4">研討剩餘</div>
                <div className="text-[22vw] font-black text-white leading-none tabular-nums tracking-tighter">{cd !== null ? fmtCd(cd) : '時間到'}</div>
                <div className="text-slate-500 text-3xl font-mono mt-6">現在 {now}</div>
              </div>
            )}
            {disc === 'class' && (
              <div className="space-y-10">
                <div className="text-slate-500 text-2xl font-bold tracking-[0.4em] uppercase">下堂上課時間</div>
                <div className="text-[13vw] font-black text-blue-500 leading-none">{nextClass}</div>
                <div className="flex items-center justify-center space-x-16">
                  <div className="text-center">
                    <div className="text-slate-500 text-xl font-bold uppercase tracking-widest mb-1">現在</div>
                    <div className="text-slate-200 text-5xl font-mono">{now}</div>
                  </div>
                  {remainMin !== null && (
                    <div className="text-center">
                      <div className="text-slate-500 text-xl font-bold uppercase tracking-widest mb-1">距離上課</div>
                      <div className="text-white text-5xl font-black">{remainMin} 分鐘</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {disc === 'clock' && <div className="text-[18vw] font-black text-white font-mono">{now}</div>}
          </div>
        </div>
      )}

      {/* 主畫面 */}
      <div className="flex-1 relative overflow-hidden"
        onClick={() => { if (mode === 'overlay') gotoSub(subRef.current + 1); else if (mode === 'presenter') nextLine(); }}>
        {mode === 'reader' && (
          <div id="reader-scroll" className="h-full bg-white overflow-y-auto py-16 px-6 sm:px-12" style={{ paddingBottom: 120 }}>
            <div className="mx-auto" style={{ maxWidth: `${contentWidth}px`, fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334' }} dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        {mode === 'presenter' && (
          <div className="h-full relative">
            {bgImageUrl && <img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="BG" />}
            <div className="absolute inset-0 bg-black/30 z-10" />
            <div className={`absolute z-20 transition-opacity duration-500 ${hide ? 'opacity-0' : 'opacity-100'}`}
              style={{ width: `${presW}%`, height: `${presH}%`, left: '50%', transform: 'translateX(-50%)', bottom: barVisible ? '100px' : '5%' }}>
              <div className="w-full h-full bg-black/60 backdrop-blur-3xl p-8 rounded-[4rem] border border-white/10 flex items-center justify-center shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
                <div className="text-white font-black text-center leading-tight" style={{ fontSize: `${fontSize * 2}px` }}>{lines[idx]}</div>
              </div>
            </div>
          </div>
        )}

        {mode === 'overlay' && (
          <div className={`h-full flex flex-col px-10 ${overlayPos === 'bottom' ? 'justify-end' : 'justify-start'} ${hide ? 'opacity-0' : 'opacity-100'}`}
            style={overlayPos === 'bottom' ? { paddingBottom: barVisible ? 130 : 80 } : { paddingTop: 80 }}>
            <div className="text-center font-black text-white whitespace-nowrap overflow-hidden"
              style={{ fontSize: `${fontSize * 2}px`, textShadow: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' }}>
              {subs[sub] ?? ''}
            </div>
          </div>
        )}
      </div>

      {/* 常駐控制列（單螢幕）/ 雙螢幕時滑鼠移到底部浮出 */}
      <div className={`shrink-0 z-50 bg-black/90 backdrop-blur-md text-white border-t border-white/10 transition-all duration-300 ${barVisible ? '' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}>
        <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-2 text-[11px] font-bold">
          <button onClick={() => setStage('mode')} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">設定 Q</button>
          <div className="flex bg-white/10 rounded-lg overflow-hidden">
            {(['reader', 'presenter', 'overlay'] as Mode[]).map(m => (
              <button key={m} onClick={() => switchMode(m)} className={`px-3 py-1.5 ${mode === m ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{MODE_META[m].title.replace('模式', '')}</button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2">
            <span className="text-white/50">字級</span>
            <button onClick={() => setFontSize(f => Math.max(16, f - 4))} className="px-2 py-1 hover:bg-white/20 rounded">−</button>
            <span className="w-7 text-center tabular-nums">{fontSize}</span>
            <button onClick={() => setFontSize(f => Math.min(80, f + 4))} className="px-2 py-1 hover:bg-white/20 rounded">＋</button>
          </div>

          {mode === 'presenter' && (
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3">
              <span className="text-white/50">框寬</span>
              <input type="range" min="30" max="100" value={presW} onChange={e => setPresW(parseInt(e.target.value))} className="w-16 accent-blue-500" />
              <span className="text-white/50">高</span>
              <input type="range" min="10" max="80" value={presH} onChange={e => setPresH(parseInt(e.target.value))} className="w-16 accent-blue-500" />
            </div>
          )}

          {mode === 'reader' && (
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3">
              <span className="text-white/50">版寬</span>
              <input type="range" min="400" max="2000" value={contentWidth} onChange={e => setContentWidth(parseInt(e.target.value))} className="w-24 accent-blue-500" />
            </div>
          )}

          {mode === 'overlay' && (
            <button onClick={() => setOverlayPos(p => p === 'bottom' ? 'top' : 'bottom')} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">字幕{overlayPos === 'bottom' ? '置底' : '置頂'}</button>
          )}

          {mode !== 'reader' && (
            <div className="flex gap-1">
              <button onClick={prevLine} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">◀</button>
              <button onClick={() => mode === 'overlay' ? gotoSub(subRef.current + 1) : nextLine()} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500">▶</button>
            </div>
          )}

          <button onClick={toggleHide} className={`px-3 py-1.5 rounded-lg ${hide ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}>黑屏 B</button>
          <button onClick={startCountdown} className={`px-3 py-1.5 rounded-lg ${disc === 'countdown' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>倒數</button>
          <button onClick={setClassSync} className={`px-3 py-1.5 rounded-lg ${disc === 'class' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>上課</button>
          <button onClick={() => setDiscSync('clock')} className={`px-3 py-1.5 rounded-lg ${disc === 'clock' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>時鐘</button>
          <button onClick={() => setDiscSync('none')} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">關閉 Esc</button>
          <button onClick={() => { persist(); window.open('/?mode=controller', '_blank'); }}
            className={`px-3 py-1.5 rounded-lg ${dual ? 'bg-emerald-600' : 'bg-emerald-700 hover:bg-emerald-600'}`}>
            {dual ? '雙螢幕控制中 ●' : '切換雙螢幕 ↗'}
          </button>
        </div>
      </div>

      {/* 音檔列（閱覽模式） */}
      {mode === 'reader' && audioUrl && (
        <div className="shrink-0 h-14 bg-white border-t flex items-center justify-center px-4 z-40">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl h-9" />
        </div>
      )}
    </div>
  );
}
