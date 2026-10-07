"use client";

import React, { useState, useEffect, useRef } from 'react';

type ViewMode = 'reader' | 'presenter' | 'overlay' | 'controller';

const getDirectAudioUrl = (url: string) => {
  if (url.includes('drive.google.com')) {
    const id = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
  }
  return url;
};

export default function VoxReader() {
  // --- Core States ---
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('reader');
  
  // Customization
  const [presW, setPresW] = useState(90);
  const [presH, setPresH] = useState(30);
  const [overlayBg, setOverlayBg] = useState('#00FF00');
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');
  
  // AV States
  const [isSetup, setIsSetup] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [hideText, setHideText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');

  // Discussion Tools
  const [discussionMode, setDiscussionOverlay] = useState<'none' | 'clock' | 'countdown' | 'class'>('none');
  const [countdownTarget, setCountdownTarget] = useState<number | null>(null);
  const [nextClassTime, setNextClassTime] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bc = useRef<BroadcastChannel | null>(null);

  // Initialize Channel for Multi-window Sync
  useEffect(() => {
    bc.current = new BroadcastChannel('vox_reader_sync');
    bc.current.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'SYNC_STATE') {
        setCurrentLineIdx(payload.idx);
        setHideText(payload.hide);
        setDiscussionOverlay(payload.disc);
        setCountdownTarget(payload.cd);
        setNextClassTime(payload.next);
      }
    };
    return () => bc.current?.close();
  }, []);

  // Sync state to other windows whenever it changes (only if in controller mode)
  useEffect(() => {
    if (viewMode === 'controller') {
      bc.current?.postMessage({
        type: 'SYNC_STATE',
        payload: { idx: currentLineIdx, hide: hideText, disc: discussionMode, cd: countdownTarget, next: nextClassTime }
      });
    }
  }, [currentLineIdx, hideText, discussionMode, countdownTarget, nextClassTime, viewMode]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})), 1000);
    return () => clearInterval(t);
  }, []);

  // Countdown
  useEffect(() => {
    if (countdownTarget === null || countdownTarget <= 0) return;
    const t = setInterval(() => setCountdownTarget(prev => (prev && prev > 0 ? prev - 1 : null)), 1000);
    return () => clearInterval(t);
  }, [countdownTarget]);

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

  const handleLoad = async (mode: ViewMode) => {
    if (!docUrl) return;
    setLoading(true);
    setViewMode(mode);
    
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-bg-url', bgImageUrl);
    localStorage.setItem('vox-font-size', fontSize.toString());
    localStorage.setItem('vox-pres-w', presW.toString());
    localStorage.setItem('vox-pres-h', presH.toString());

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const rawText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const target = (doc.querySelector('#contents') || doc.body) as HTMLElement;
      
      const text = target.innerText || target.textContent || "";
      const rawLines = text.split(/[。\n！？]/).map(l => l.trim()).filter(l => l.length > 1);
      setLines(rawLines);
      
      target.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
      target.querySelectorAll('*').forEach(el => { (el as HTMLElement).removeAttribute('style'); el.removeAttribute('class'); });
      setContent(target.innerHTML);
      
      setIsSetup(false);
    } catch (e) { alert('載入失敗'); } finally { setLoading(false); }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const r = new FileReader();
      r.onloadend = () => { setBgImageUrl(r.result as string); localStorage.setItem('vox-bg-url', r.result as string); };
      r.readAsDataURL(file);
    }
  };

  if (isSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f0f2f5] font-sans">
        <div className="w-full max-w-5xl bg-white shadow-2xl rounded-[3rem] overflow-hidden flex flex-col md:flex-row">
          {/* Left: Source */}
          <div className="p-12 md:w-1/2 space-y-8">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter italic">VoxReader Pro <span className="text-blue-500">v2.4</span></h1>
            <div className="space-y-4">
               <div>
                 <label className="text-[10px] font-black text-slate-400 uppercase">1. 內容源與音檔</label>
                 <input type="text" value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="Google Docs Link" className="w-full mt-1 p-4 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-blue-500" />
                 <input type="text" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="Audio Link (Optional)" className="w-full mt-2 p-4 bg-slate-50 rounded-2xl outline-none" />
               </div>
               <div>
                 <label className="text-[10px] font-black text-slate-400 uppercase">2. 講師背景圖片</label>
                 <div onClick={() => fileInputRef.current?.click()} className="mt-1 w-full h-40 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition overflow-hidden">
                    {bgImageUrl ? <img src={bgImageUrl} className="w-full h-full object-cover" alt="BG" /> : <span className="text-slate-400 font-bold">點擊上傳圖片</span>}
                    <input type="file" ref={fileInputRef} onChange={handleImage} className="hidden" accept="image/*" />
                 </div>
               </div>
            </div>
          </div>

          {/* Right: Layout Config */}
          <div className="p-12 md:w-1/2 bg-slate-50 space-y-8 border-l border-slate-100">
            <h2 className="text-xs font-black text-blue-600 uppercase tracking-widest">3. 版面與啟動</h2>
            <div className="space-y-6">
               <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400">講師模式文字區塊大小</label>
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-slate-400 w-8">寬 {presW}%</span>
                    <input type="range" min="30" max="100" value={presW} onChange={e => setPresW(parseInt(e.target.value))} className="flex-1 accent-blue-600" />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-slate-400 w-8">高 {presH}%</span>
                    <input type="range" min="10" max="80" value={presH} onChange={e => setPresH(parseInt(e.target.value))} className="flex-1 accent-blue-400" />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 pt-4">
                  <button onClick={() => handleLoad('controller')} className="p-6 bg-slate-800 text-white rounded-3xl font-black hover:bg-slate-700 transition shadow-xl">開啟 控制後台<div className="text-[9px] text-slate-400 mt-1">主控端視窗</div></button>
                  <button onClick={() => handleLoad('presenter')} className="p-6 bg-blue-600 text-white rounded-3xl font-black hover:bg-blue-500 transition shadow-xl shadow-blue-200 text-center flex flex-col items-center">啟動 投影畫面<div className="text-[9px] text-blue-200 mt-1">講師播放模式</div></button>
                  <button onClick={() => handleLoad('reader')} className="p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-100">閱覽模式</button>
                  <button onClick={() => handleLoad('overlay')} className="p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-100">字幕模式</button>
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDERING ---
  
  if (viewMode === 'controller') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col space-y-6 select-none font-sans">
        <div className="flex justify-between items-center">
           <h1 className="text-xl font-black tracking-tighter italic">VOX <span className="text-blue-500">CONTROLLER</span></h1>
           <div className="flex items-center space-x-4">
              <div className="text-right"><div className="text-[10px] text-slate-500 uppercase">現在時間</div><div className="text-lg font-mono">{currentTime}</div></div>
              <button onClick={() => setIsSetup(true)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold hover:bg-red-900 transition">退出</button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
           {/* Left: Preview & Tools */}
           <div className="md:col-span-2 space-y-6">
              <div className="bg-slate-800 p-8 rounded-[2rem] border border-slate-700">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">目前播放內容</label>
                 <div className="text-3xl font-bold mt-4 leading-relaxed h-32 flex items-center">{lines[currentLineIdx] || "---"}</div>
                 <div className="text-sm text-blue-400 mt-4 font-bold italic">下一句: {lines[currentLineIdx+1] || "(最後一句)"}</div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                 <button onClick={() => setHideText(!hideText)} className={`p-6 rounded-3xl font-black transition-all ${hideText ? 'bg-red-600' : 'bg-slate-800 hover:bg-slate-700'}`}>黑屏 (B)</button>
                 <button onClick={() => {const m = prompt('倒數分鐘?','10'); if(m) {setCountdownTarget(parseInt(m)*60); setDiscussionOverlay('countdown');}}} className={`p-6 rounded-3xl font-black ${discussionMode === 'countdown' ? 'bg-blue-600' : 'bg-slate-800'}`}>研討倒數</button>
                 <button onClick={() => {const t = prompt('上課時間?','14:00'); if(t) {setNextClassTime(t); setDiscussionOverlay('class');}}} className={`p-6 rounded-3xl font-black ${discussionMode === 'class' ? 'bg-blue-600' : 'bg-slate-800'}`}>上課提醒</button>
              </div>

              <div className="flex space-x-4">
                 <button onClick={() => setCurrentLineIdx(Math.max(0, currentLineIdx - 1))} className="flex-1 p-8 bg-slate-800 rounded-[2rem] text-4xl hover:bg-slate-700 active:scale-95 transition">PREV</button>
                 <button onClick={() => setCurrentLineIdx(Math.min(lines.length-1, currentLineIdx + 1))} className="flex-[2] p-8 bg-blue-600 rounded-[2rem] text-4xl font-black hover:bg-blue-500 active:scale-95 transition shadow-2xl shadow-blue-900/50">NEXT</button>
              </div>
           </div>

           {/* Right: List */}
           <div className="bg-slate-800 rounded-[2rem] overflow-hidden flex flex-col border border-slate-700">
              <div className="p-4 bg-slate-700 text-[10px] font-bold uppercase tracking-widest text-slate-400">句子清單</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                 {lines.map((l, i) => (
                    <button key={i} onClick={() => setCurrentLineIdx(i)} className={`w-full text-left p-3 rounded-xl text-xs transition ${i === currentLineIdx ? 'bg-blue-600' : 'hover:bg-slate-700 text-slate-400'}`}>{i+1}. {l.substring(0,30)}</button>
                 ))}
              </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-500`}
         style={viewMode === 'overlay' ? { backgroundColor: overlayBg } : { backgroundColor: '#111' }}>
      
      {/* Discussion Overlays (Clock/Class/Countdown) */}
      {discussionMode !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black animate-in fade-in duration-500">
           <div className="text-center w-full px-20">
              {discussionMode === 'countdown' && countdownTarget !== null && (
                 <div className="text-[25vw] font-black text-white leading-none tabular-nums tracking-tighter drop-shadow-[0_20px_50px_rgba(0,0,0,1)]">
                   {Math.floor(countdownTarget/60)}:{String(countdownTarget%60).padStart(2,'0')}
                 </div>
              )}
              {discussionMode === 'class' && (
                 <div className="space-y-12">
                    <div className="text-blue-500 text-[15vw] font-black leading-none uppercase drop-shadow-2xl">{nextClassTime}</div>
                    <div className="flex items-center justify-center space-x-12">
                       <div className="text-slate-400 text-4xl font-bold uppercase tracking-widest">現在時間</div>
                       <div className="text-slate-300 text-6xl font-mono">{currentTime}</div>
                    </div>
                 </div>
              )}
              {discussionMode === 'clock' && <div className="text-[20vw] font-black text-white font-mono">{currentTime}</div>}
           </div>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex-1 relative overflow-hidden" onClick={() => viewMode !== 'reader' && setCurrentLineIdx(p => Math.min(lines.length-1, p+1))}>
        
        {viewMode === 'reader' && (
          <div className="h-full bg-white overflow-y-auto py-20 px-12 sm:px-24">
            <div className="mx-auto" style={{ maxWidth: `${contentWidth}px`, fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334' }} dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        {viewMode === 'presenter' && (
          <div className="h-full relative flex flex-col items-center justify-center">
            {bgImageUrl && <img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="BG" />}
            <div className="absolute inset-0 bg-black/30 z-10" />
            <div className={`relative z-20 flex flex-col items-center transition-opacity duration-500 ${hideText ? 'opacity-0' : 'opacity-100'}`} 
                 style={{ width: `${presW}%`, height: `${presH}%`, bottom: '5%', position: 'absolute' }}>
               <div className="w-full h-full bg-black/60 backdrop-blur-3xl p-12 rounded-[4rem] border border-white/10 flex items-center justify-center shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
                 <div className="text-white font-black text-center leading-tight" style={{ fontSize: `${fontSize * 2}px` }}>
                   {lines[currentLineIdx]}
                 </div>
               </div>
            </div>
          </div>
        )}

        {viewMode === 'overlay' && (
          <div className={`h-full flex flex-col px-20 ${overlayPos === 'bottom' ? 'justify-end pb-24' : 'justify-start pt-24'} ${hideText ? 'opacity-0' : 'opacity-100'}`}>
             <div className="text-center font-black text-white truncate" 
                  style={{ fontSize: `${fontSize * 2}px`, textShadow: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' }}>
                {lines[currentLineIdx]}
             </div>
          </div>
        )}
      </div>

      {audioUrl && viewMode === 'reader' && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4"><audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl h-8" /></div>
      )}
    </div>
  );
}
