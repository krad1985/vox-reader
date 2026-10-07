"use client";

import React, { useState, useEffect, useRef } from 'react';

type ViewMode = 'reader' | 'presenter' | 'overlay' | 'controller';
type Disc = 'none' | 'clock' | 'countdown' | 'class';
type SyncState = { idx: number; sub: number; hide: boolean; disc: Disc; cd: number | null; next: string };

const getDirectAudioUrl = (url: string) => {
  if (url.includes('drive.google.com')) {
    const id = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
  }
  return url;
};

// 字幕分塊：一行最多 16 個中文字
const chunkText = (s: string, n = 16): string[] => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmtCountdown = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
};

export default function VoxReader() {
  // --- Core States ---
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('reader');
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');

  // Customization
  const [presW, setPresW] = useState(90);
  const [presH, setPresH] = useState(30);

  // AV States
  const [isSetup, setIsSetup] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [currentSub, setCurrentSub] = useState(0);
  const [hideText, setHideText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');

  // Discussion Tools
  const [disc, setDisc] = useState<Disc>('none');
  const [cd, setCd] = useState<number | null>(null);
  const [nextClassTime, setNextClassTime] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  // Refs (即時同步用，避免快速連點 stale closure)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bc = useRef<BroadcastChannel | null>(null);
  const tabId = useRef(Math.random().toString(36).slice(2));
  const lineStartRef = useRef<number[]>([]);
  const linesLenRef = useRef(0);
  const idxRef = useRef(0);
  const subRef = useRef(0);
  const hideRef = useRef(false);
  const discRef = useRef<Disc>('none');
  const cdRef = useRef<number | null>(null);
  const nextRef = useRef('');

  const send = (over: Partial<SyncState>) => {
    const payload: SyncState = {
      idx: idxRef.current, sub: subRef.current, hide: hideRef.current,
      disc: discRef.current, cd: cdRef.current, next: nextRef.current,
      ...over,
    };
    bc.current?.postMessage({ src: tabId.current, payload });
  };

  // --- 多視窗連動（收到即套用，不做 effect 廣播，避免迴圈） ---
  useEffect(() => {
    bc.current = new BroadcastChannel('vox_reader_sync');
    bc.current.onmessage = (ev) => {
      const { src, payload } = ev.data || {};
      if (src === tabId.current || !payload) return;
      idxRef.current = payload.idx; subRef.current = payload.sub;
      hideRef.current = payload.hide; discRef.current = payload.disc;
      cdRef.current = payload.cd; nextRef.current = payload.next;
      setCurrentLineIdx(payload.idx); setCurrentSub(payload.sub);
      setHideText(payload.hide); setDisc(payload.disc);
      setCd(payload.cd); setNextClassTime(payload.next);
    };
    return () => bc.current?.close();
  }, []);

  // Ref 鏡像（每次 render 後更新）
  useEffect(() => {
    hideRef.current = hideText; discRef.current = disc;
    cdRef.current = cd; nextRef.current = nextClassTime;
  });

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  // Countdown（本地倒數；起始由 broadcast 同步）
  useEffect(() => {
    if (cd === null || cd <= 0) return;
    const t = setInterval(() => setCd(prev => (prev && prev > 0 ? prev - 1 : null)), 1000);
    return () => clearInterval(t);
  }, [cd]);

  // Load Persistence
  useEffect(() => {
    setDocUrl(localStorage.getItem('vox-doc-url') || '');
    setAudioUrl(localStorage.getItem('vox-audio-url') || '');
    setBgImageUrl(localStorage.getItem('vox-bg-url') || '');
    setContentWidth(parseInt(localStorage.getItem('vox-content-width') || '800'));
    setFontSize(parseInt(localStorage.getItem('vox-font-size') || '24'));
    setPresW(parseInt(localStorage.getItem('vox-pres-w') || '90'));
    setPresH(parseInt(localStorage.getItem('vox-pres-h') || '30'));
  }, []);

  // Deep link: /?mode=controller 直接開啟控制後台
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const m = new URLSearchParams(window.location.search).get('mode');
    if (m && ['reader', 'presenter', 'overlay', 'controller'].includes(m)) {
      const u = localStorage.getItem('vox-doc-url');
      if (u) loadDoc(m as ViewMode, u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDoc = async (mode: ViewMode, url: string) => {
    if (!url) return;
    setLoading(true);
    setViewMode(mode);
    localStorage.setItem('vox-doc-url', url);
    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(url)}`);
      const rawText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const target = (doc.querySelector('#contents') || doc.body) as HTMLElement;

      const text = target.innerText || target.textContent || '';
      const sentences = text.split(/[。\n！？]/).map(l => l.trim()).filter(l => l.length > 1);
      const flat: string[] = []; const starts: number[] = [];
      sentences.forEach(s => { starts.push(flat.length); flat.push(...chunkText(s)); });
      lineStartRef.current = starts;
      linesLenRef.current = sentences.length;
      idxRef.current = 0; subRef.current = 0;
      setLines(sentences); setSubs(flat);
      setCurrentLineIdx(0); setCurrentSub(0);

      target.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
      target.querySelectorAll('*').forEach(el => { (el as HTMLElement).removeAttribute('style'); el.removeAttribute('class'); });
      setContent(target.innerHTML);

      setIsSetup(false);
      send({ idx: 0, sub: 0 });
    } catch { alert('載入失敗'); } finally { setLoading(false); }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const r = new FileReader();
      r.onloadend = () => { setBgImageUrl(r.result as string); localStorage.setItem('vox-bg-url', r.result as string); };
      r.readAsDataURL(file);
    }
  };

  // --- Actions（本地更新 + 廣播） ---
  const gotoLine = (i: number) => {
    const n = Math.max(0, Math.min(linesLenRef.current - 1, i));
    const s = lineStartRef.current[n] ?? 0;
    idxRef.current = n; subRef.current = s;
    setCurrentLineIdx(n); setCurrentSub(s);
    send({ idx: n, sub: s });
  };
  const nextLine = () => gotoLine(idxRef.current + 1);
  const prevLine = () => gotoLine(idxRef.current - 1);

  const gotoSub = (s: number) => {
    const max = lineStartRef.current.length > 0
      ? (lineStartRef.current[lineStartRef.current.length - 1] + 100) : 0;
    const n = Math.max(0, Math.min(max, s));
    let idx = idxRef.current;
    const starts = lineStartRef.current;
    while (idx < linesLenRef.current - 1 && starts[idx + 1] <= n) idx++;
    while (idx > 0 && n < starts[idx]) idx--;
    idxRef.current = idx; subRef.current = n;
    setCurrentLineIdx(idx); setCurrentSub(n);
    send({ idx, sub: n });
  };

  const toggleHide = () => { const v = !hideRef.current; hideRef.current = v; setHideText(v); send({ hide: v }); };
  const setDiscSync = (d: Disc) => { discRef.current = d; setDisc(d); send({ disc: d }); };
  const startCountdown = () => {
    const m = prompt('研討倒數幾分鐘？', '10');
    if (!m) return;
    const sec = parseInt(m) * 60;
    cdRef.current = sec; setCd(sec);
    discRef.current = 'countdown'; setDisc('countdown');
    send({ cd: sec, disc: 'countdown' });
  };
  const setClassSync = () => {
    const t = prompt('下堂課時間（HH:MM）', '14:00');
    if (!t) return;
    nextRef.current = t; setNextClassTime(t);
    discRef.current = 'class'; setDisc('class');
    send({ next: t, disc: 'class' });
  };

  // --- Hotkeys ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSetup) return;
      const k = e.key;
      if (k === 'b' || k === 'B') { toggleHide(); return; }
      if (k === 'Escape') { setDiscSync('none'); return; }
      if (viewMode === 'controller') {
        if (k === 'ArrowRight' || k === ' ' || k === 'Enter') { e.preventDefault(); nextLine(); }
        if (k === 'ArrowLeft' || k === 'Backspace') { e.preventDefault(); prevLine(); }
        return;
      }
      if (viewMode === 'reader') {
        const el = document.getElementById('reader-scroll');
        if (k === 'ArrowDown' || k === ' ') { e.preventDefault(); (el || window).scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); }
        if (k === 'ArrowUp') { e.preventDefault(); (el || window).scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); }
        return;
      }
      if (k === 'ArrowRight' || k === ' ' || k === 'Enter') { e.preventDefault(); nextLine(); }
      if (k === 'ArrowLeft' || k === 'Backspace') { e.preventDefault(); prevLine(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetup, viewMode]);

  // 上課剩餘分鐘
  const classRemainMin = (() => {
    const m = nextClassTime.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const now = new Date(); const t = new Date(now);
    t.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return Math.round((t.getTime() - now.getTime()) / 60000);
  })();

  const openController = () => {
    if (docUrl) localStorage.setItem('vox-doc-url', docUrl);
    window.open('/?mode=controller', '_blank');
  };

  // ============ SETUP ============
  if (isSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f0f2f5] font-sans">
        <div className="w-full max-w-5xl bg-white shadow-2xl rounded-[3rem] overflow-hidden flex flex-col md:flex-row">
          <div className="p-12 md:w-1/2 space-y-6">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter italic">VoxReader Pro <span className="text-blue-500">v2.5</span></h1>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase">1. 內容源與音檔</label>
                <input type="text" value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="Google Docs Link" className="w-full mt-1 p-4 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-blue-500" />
                <input type="text" value={audioUrl} onChange={e => { setAudioUrl(e.target.value); localStorage.setItem('vox-audio-url', e.target.value); }} placeholder="Audio Link (Optional)" className="w-full mt-2 p-4 bg-slate-50 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase">2. 講師背景圖片</label>
                <div onClick={() => fileInputRef.current?.click()} className="mt-1 w-full h-40 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition overflow-hidden">
                  {bgImageUrl ? <img src={bgImageUrl} className="w-full h-full object-cover" alt="BG" /> : <span className="text-slate-400 font-bold">點擊上傳圖片</span>}
                  <input type="file" ref={fileInputRef} onChange={handleImage} className="hidden" accept="image/*" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400">閱讀字級 {fontSize}px</label>
                  <input type="range" min="16" max="60" value={fontSize} onChange={e => { const v = parseInt(e.target.value); setFontSize(v); localStorage.setItem('vox-font-size', String(v)); }} className="w-full accent-blue-600" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400">閱讀寬度 {contentWidth}px</label>
                  <input type="range" min="400" max="2000" value={contentWidth} onChange={e => { const v = parseInt(e.target.value); setContentWidth(v); localStorage.setItem('vox-content-width', String(v)); }} className="w-full accent-blue-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="p-12 md:w-1/2 bg-slate-50 space-y-6 border-l border-slate-100">
            <h2 className="text-xs font-black text-blue-600 uppercase tracking-widest">3. 版面與啟動</h2>
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400">講師模式文字區塊：寬度 / 高度（播放中也可調）</label>
                <div className="flex items-center space-x-4">
                  <span className="text-xs text-slate-400 w-14">寬 {presW}%</span>
                  <input type="range" min="30" max="100" value={presW} onChange={e => { const v = parseInt(e.target.value); setPresW(v); localStorage.setItem('vox-pres-w', String(v)); }} className="flex-1 accent-blue-600" />
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-xs text-slate-400 w-14">高 {presH}%</span>
                  <input type="range" min="10" max="80" value={presH} onChange={e => { const v = parseInt(e.target.value); setPresH(v); localStorage.setItem('vox-pres-h', String(v)); }} className="flex-1 accent-blue-400" />
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button onClick={openController} className="w-full p-5 bg-slate-800 text-white rounded-3xl font-black hover:bg-slate-700 transition shadow-xl text-left flex justify-between items-center">
                  <span>① 開啟控制後台<span className="block text-[9px] text-slate-400 font-normal mt-1">另開分頁，投影不會看到按鈕</span></span>
                  <span className="text-2xl">↗</span>
                </button>
                <button onClick={() => loadDoc('presenter', docUrl)} disabled={loading} className="w-full p-5 bg-blue-600 text-white rounded-3xl font-black hover:bg-blue-500 transition shadow-xl shadow-blue-200 text-center disabled:opacity-50">
                  {loading ? '載入中…' : '② 啟動投影畫面（講師模式）'}
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => loadDoc('overlay', docUrl)} disabled={loading} className="p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">字幕模式</button>
                  <button onClick={() => loadDoc('reader', docUrl)} disabled={loading} className="p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">閱覽模式</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ CONTROLLER（獨立控制後台） ============
  if (viewMode === 'controller') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-8 flex flex-col space-y-5 select-none font-sans">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-black tracking-tighter italic">VOX <span className="text-blue-500">CONTROLLER</span> <span className="text-[9px] text-slate-600 ml-2">v2.5</span></h1>
          <div className="flex items-center space-x-6">
            {nextClassTime && (
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase">下堂課 {nextClassTime}</div>
                <div className="text-lg font-mono text-blue-400">{currentTime}</div>
              </div>
            )}
            {!nextClassTime && <div className="text-right"><div className="text-[10px] text-slate-500 uppercase">現在時間</div><div className="text-lg font-mono">{currentTime}</div></div>}
            <button onClick={() => setIsSetup(true)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold hover:bg-red-900 transition">退出</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-h-0">
          <div className="md:col-span-2 space-y-5 flex flex-col">
            <div className="bg-slate-800 p-7 rounded-[2rem] border border-slate-700">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">目前播放（{currentLineIdx + 1}/{lines.length}，字幕 {currentSub + 1}/{subs.length}）</label>
              <div className="text-3xl font-bold mt-3 leading-relaxed">{lines[currentLineIdx] || '---'}</div>
              <div className="text-sm text-blue-400 mt-3 font-bold italic">下一句：{lines[currentLineIdx + 1] || '（最後一句）'}</div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <button onClick={toggleHide} className={`p-5 rounded-3xl font-black transition-all ${hideText ? 'bg-red-600' : 'bg-slate-800 hover:bg-slate-700'}`}>黑屏<span className="block text-[9px] opacity-50">B</span></button>
              <button onClick={startCountdown} className={`p-5 rounded-3xl font-black ${disc === 'countdown' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>研討倒數{cd !== null && cd > 0 && <span className="block text-[11px] text-blue-300">{fmtCountdown(cd)}</span>}</button>
              <button onClick={setClassSync} className={`p-5 rounded-3xl font-black ${disc === 'class' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}>上課提醒{nextClassTime && <span className="block text-[11px] text-blue-300">{nextClassTime}</span>}</button>
            </div>

            <div className="flex space-x-3">
              <button onClick={prevLine} className="flex-1 p-7 bg-slate-800 rounded-[2rem] text-3xl hover:bg-slate-700 active:scale-95 transition">◀ 上一句</button>
              <button onClick={nextLine} className="flex-[2] p-7 bg-blue-600 rounded-[2rem] text-3xl font-black hover:bg-blue-500 active:scale-95 transition shadow-2xl shadow-blue-900/50">下一句 ▶</button>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => setDiscSync('clock')} className={`flex-1 p-3 rounded-2xl text-xs font-black ${disc === 'clock' ? 'bg-blue-600' : 'bg-slate-800'}`}>時鐘</button>
              <button onClick={() => setDiscSync('none')} className="flex-1 p-3 rounded-2xl text-xs font-black bg-slate-800 hover:bg-slate-700">關閉覆蓋（Esc）</button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-[2rem] overflow-hidden flex flex-col border border-slate-700 min-h-0">
            <div className="p-4 bg-slate-700 text-[10px] font-bold uppercase tracking-widest text-slate-400">句子清單（點擊跳轉）</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {lines.map((l, i) => (
                <button key={i} onClick={() => gotoLine(i)} className={`w-full text-left p-3 rounded-xl text-xs transition ${i === currentLineIdx ? 'bg-blue-600' : 'hover:bg-slate-700 text-slate-400'}`}>{i + 1}. {l.substring(0, 30)}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ DISPLAY（投影端：無常駐按鈕，頂部工具列滑過才顯現） ============
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: viewMode === 'overlay' ? '#00FF00' : '#111' }}>

      {/* 討論覆蓋：倒數 / 上課（含現在時間+剩餘） / 時鐘 */}
      {disc !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black animate-in fade-in duration-500">
          <div className="text-center w-full px-20">
            {disc === 'countdown' && cd !== null && (
              <div>
                <div className="text-slate-500 text-2xl font-bold tracking-[0.4em] uppercase mb-4">研討剩餘</div>
                <div className="text-[22vw] font-black text-white leading-none tabular-nums tracking-tighter">{fmtCountdown(cd)}</div>
                <div className="text-slate-500 text-3xl font-mono mt-6">現在 {currentTime}</div>
              </div>
            )}
            {disc === 'class' && (
              <div className="space-y-10">
                <div className="text-slate-500 text-2xl font-bold tracking-[0.4em] uppercase">下堂上課時間</div>
                <div className="text-[13vw] font-black text-blue-500 leading-none">{nextClassTime}</div>
                <div className="flex items-center justify-center space-x-16">
                  <div className="text-center">
                    <div className="text-slate-500 text-xl font-bold uppercase tracking-widest mb-1">現在</div>
                    <div className="text-slate-200 text-5xl font-mono">{currentTime}</div>
                  </div>
                  {classRemainMin !== null && (
                    <div className="text-center">
                      <div className="text-slate-500 text-xl font-bold uppercase tracking-widest mb-1">距離上課</div>
                      <div className="text-white text-5xl font-black">{classRemainMin} 分鐘</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {disc === 'clock' && <div className="text-[18vw] font-black text-white font-mono">{currentTime}</div>}
          </div>
        </div>
      )}

      {/* 自動隱藏工具列（滑到頂部才出現，投影時不可見） */}
      <div className="absolute top-0 inset-x-0 z-50 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
        <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 bg-black/85 backdrop-blur-md text-white text-[11px] font-bold">
          <button onClick={() => setIsSetup(true)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">退出</button>
          <div className="flex bg-white/10 rounded-lg overflow-hidden">
            {(['presenter', 'overlay', 'reader'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 ${viewMode === m ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{m === 'presenter' ? '講師' : m === 'overlay' ? '字幕' : '閱覽'}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2">
            <span className="text-white/50">字級</span>
            <button onClick={() => setFontSize(f => Math.max(16, f - 4))} className="px-2 py-1 hover:bg-white/20 rounded">−</button>
            <span className="w-8 text-center tabular-nums">{fontSize}</span>
            <button onClick={() => setFontSize(f => Math.min(80, f + 4))} className="px-2 py-1 hover:bg-white/20 rounded">＋</button>
          </div>
          {viewMode === 'presenter' && (
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3">
              <span className="text-white/50">區塊寬</span>
              <input type="range" min="30" max="100" value={presW} onChange={e => { const v = parseInt(e.target.value); setPresW(v); localStorage.setItem('vox-pres-w', String(v)); }} className="w-20 accent-blue-500" />
              <span className="text-white/50">高</span>
              <input type="range" min="10" max="80" value={presH} onChange={e => { const v = parseInt(e.target.value); setPresH(v); localStorage.setItem('vox-pres-h', String(v)); }} className="w-20 accent-blue-500" />
            </div>
          )}
          <button onClick={toggleHide} className={`px-3 py-1.5 rounded-lg ${hideText ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}>黑屏 B</button>
          {viewMode === 'overlay' && (
            <button onClick={() => setOverlayPos(p => p === 'bottom' ? 'top' : 'bottom')} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">字幕 {overlayPos === 'bottom' ? '置底' : '置頂'}</button>
          )}
          <button onClick={startCountdown} className={`px-3 py-1.5 rounded-lg ${disc === 'countdown' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>倒數</button>
          <button onClick={setClassSync} className={`px-3 py-1.5 rounded-lg ${disc === 'class' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>上課</button>
          <button onClick={() => setDiscSync('clock')} className={`px-3 py-1.5 rounded-lg ${disc === 'clock' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>時鐘</button>
          <button onClick={() => setDiscSync('none')} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">關閉</button>
          <button onClick={openController} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500">開控制後台 ↗</button>
        </div>
      </div>

      {/* 主畫面 */}
      <div className="flex-1 relative overflow-hidden"
        onClick={() => {
          if (viewMode === 'overlay') gotoSub(subRef.current + 1);
          else if (viewMode === 'presenter') nextLine();
        }}>
        {viewMode === 'reader' && (
          <div id="reader-scroll" className="h-full bg-white overflow-y-auto py-20 px-12 sm:px-24">
            <div className="mx-auto" style={{ maxWidth: `${contentWidth}px`, fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334' }} dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        {viewMode === 'presenter' && (
          <div className="h-full relative flex flex-col items-center justify-center">
            {bgImageUrl && <img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="BG" />}
            <div className="absolute inset-0 bg-black/30 z-10" />
            <div className={`relative z-20 transition-opacity duration-500 ${hideText ? 'opacity-0' : 'opacity-100'}`}
              style={{ width: `${presW}%`, height: `${presH}%`, bottom: '5%', position: 'absolute' }}>
              <div className="w-full h-full bg-black/60 backdrop-blur-3xl p-8 rounded-[4rem] border border-white/10 flex items-center justify-center shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
                <div className="text-white font-black text-center leading-tight" style={{ fontSize: `${fontSize * 2}px` }}>
                  {lines[currentLineIdx]}
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'overlay' && (
          <div className={`h-full flex flex-col px-10 ${overlayPos === 'bottom' ? 'justify-end pb-24' : 'justify-start pt-24'} ${hideText ? 'opacity-0' : 'opacity-100'}`}>
            <div className="text-center font-black text-white whitespace-nowrap overflow-hidden"
              style={{ fontSize: `${fontSize * 2}px`, textShadow: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' }}>
              {subs[currentSub] ?? ''}
            </div>
          </div>
        )}
      </div>

      {audioUrl && viewMode === 'reader' && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 shrink-0">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl h-8" />
        </div>
      )}
    </div>
  );
}
