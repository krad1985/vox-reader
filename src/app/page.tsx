"use client";

import React, { useState, useEffect, useRef } from 'react';

type ViewMode = 'reader' | 'presenter' | 'overlay';

export default function VoxReader() {
  // --- States ---
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState(''); // Stores URL or Base64
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('reader');
  const [overlayBg, setOverlayBg] = useState<'#00FF00' | '#000000'>('#00FF00');
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');
  
  // Presenter Customization
  const [presW, setPresW] = useState(90);
  const [presH, setPresH] = useState(30);
  
  // A/V Personnel Assistant Tools
  const [showHelper, setShowHelper] = useState(false);
  const [hideText, setHideText] = useState(false);
  const [discussionOverlay, setDiscussionOverlay] = useState<'none' | 'clock' | 'countdown' | 'class'>('none');
  
  // Discussion Tools Data
  const [countdown, setCountdown] = useState<number | null>(null);
  const [nextClassTime, setNextClassTime] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  const [isSetup, setIsSetup] = useState(true);
  const [content, setContent] = useState<string>('');
  const [lines, setLines] = useState<string[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence & Clock
  useEffect(() => {
    setDocUrl(localStorage.getItem('vox-doc-url') || '');
    setAudioUrl(localStorage.getItem('vox-audio-url') || '');
    setBgImageUrl(localStorage.getItem('vox-bg-url') || '');
    setContentWidth(parseInt(localStorage.getItem('vox-content-width') || '800'));
    setFontSize(parseInt(localStorage.getItem('vox-font-size') || '24'));
    setPresW(parseInt(localStorage.getItem('vox-pres-w') || '90'));
    setPresH(parseInt(localStorage.getItem('vox-pres-h') || '30'));

    const clockTimer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'}));
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Countdown Logic
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => setCountdown(prev => (prev && prev > 0 ? prev - 1 : null)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs < 10 ? '0' : ''}${rs}`;
  };

  // Image Upload Handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setBgImageUrl(base64String);
        localStorage.setItem('vox-bg-url', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLoad = async () => {
    if (!docUrl) return;
    setLoading(true);
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-content-width', contentWidth.toString());
    localStorage.setItem('vox-font-size', fontSize.toString());

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const rawText = await res.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const target = (doc.querySelector('#contents') || doc.body) as HTMLElement;
      target.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
      
      // Fix TS innerText error by casting
      const textContent = target.innerText || target.textContent || "";
      const rawLines = textContent
        .split(/[。\n！？]/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 1);
      
      setLines(rawLines);
      
      target.querySelectorAll('*').forEach(el => { 
        (el as HTMLElement).removeAttribute('style'); 
        el.removeAttribute('class'); 
      });
      setContent(target.innerHTML);
      setIsSetup(false);
      setCurrentLineIdx(0);
    } catch (err: any) {
      alert('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  // Global Navigation
  const nextLine = () => setCurrentLineIdx(prev => Math.min(lines.length - 1, prev + 1));
  const prevLine = () => setCurrentLineIdx(prev => Math.max(0, prev - 1));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSetup) return;
      // Hotkeys for AV Personnel
      if (e.key === 'b' || e.key === 'B') setHideText(prev => !prev);
      if (e.key === 'h' || e.key === 'H') setShowHelper(prev => !prev);
      
      if (viewMode === 'reader') {
        if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); scrollRef.current?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); }
        if (e.key === 'ArrowUp') { e.preventDefault(); scrollRef.current?.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); }
      } else {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextLine(); }
        if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); prevLine(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup, viewMode, lines]);

  const getDirectAudioUrl = (url: string) => {
    if (url.includes('drive.google.com')) {
      const id = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
      return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
    }
    return url;
  };

  if (isSetup) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-100 font-sans">
        <div className="w-full max-w-4xl bg-white p-10 rounded-[2.5rem] shadow-2xl space-y-8">
          <h1 className="text-4xl font-black text-slate-800 text-center italic">VoxReader Pro v2.3</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 border-l-4 border-blue-600 pl-2 uppercase">1. 內容來源</h2>
              <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-blue-500" />
              <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" />
            </div>
            
            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 border-l-4 border-blue-600 pl-2 uppercase">2. 講師背景</h2>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition"
              >
                {bgImageUrl ? (
                   <img src={bgImageUrl} className="h-full w-full object-cover rounded-2xl" alt="Preview" />
                ) : (
                  <span className="text-slate-400 text-xs font-bold">點擊上傳講師圖片</span>
                )}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>
              <input type="text" value={bgImageUrl} onChange={(e) => setBgImageUrl(e.target.value)} placeholder="或輸入圖片網址" className="w-full p-3 bg-slate-50 rounded-xl text-xs" />
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 border-l-4 border-blue-600 pl-2 uppercase">3. 模式預設</h2>
              <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold">
                <option value="reader">閱覽模式 (研讀)</option>
                <option value="presenter">講師模式 (播放)</option>
                <option value="overlay">字幕模式 (導播)</option>
              </select>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">區塊寬度 ({presW}%) / 高度 ({presH}%)</label>
                <div className="flex space-x-2">
                  <input type="range" min="30" max="100" value={presW} onChange={(e) => setPresW(parseInt(e.target.value))} className="flex-1" />
                  <input type="range" min="10" max="80" value={presH} onChange={(e) => setPresH(parseInt(e.target.value))} className="flex-1" />
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleLoad} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-xl hover:bg-blue-600 transition-all shadow-xl">
            啟動視聽工作台
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-500`}
         style={viewMode === 'overlay' ? { backgroundColor: overlayBg } : { backgroundColor: '#f5f5f4' }}>
      
      {/* Discussion Overlays */}
      {discussionOverlay !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-3xl animate-in fade-in duration-300">
           <div className="text-center space-y-8">
              {discussionOverlay === 'countdown' && countdown !== null && (
                 <div className="text-[15rem] font-black text-white leading-none tabular-nums tracking-tighter">{formatCountdown(countdown)}</div>
              )}
              {discussionOverlay === 'class' && (
                 <div className="space-y-4">
                    <div className="text-slate-500 text-2xl font-bold tracking-[0.5em] uppercase">下堂上課時間</div>
                    <div className="text-[10rem] font-black text-blue-500">{nextClassTime || '--:--'}</div>
                 </div>
              )}
              {discussionOverlay === 'clock' && (
                 <div className="text-[12rem] font-black text-white font-mono">{currentTime}</div>
              )}
              <button onClick={() => setDiscussionOverlay('none')} className="px-12 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-black uppercase tracking-widest transition">返回播放</button>
           </div>
        </div>
      )}

      {/* AV Assistant Helper (Floating) */}
      {showHelper && (
        <div className="fixed top-20 right-6 w-80 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl z-[60] border border-slate-200 overflow-hidden animate-in slide-in-from-right-4">
          <div className="p-4 bg-slate-900 text-white text-xs font-black tracking-widest flex justify-between">
            <span>播放助手 (熱鍵: H)</span>
            <button onClick={() => setShowHelper(false)}>✕</button>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase">下一句預覽</label>
               <div className="p-3 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 italic">
                 {lines[currentLineIdx + 1] || "(最後一句)"}
               </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
               <button onClick={() => setHideText(p => !prevLine)} className={`p-3 rounded-xl text-[10px] font-black transition ${hideText ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}`}>黑屏 (B)</button>
               <button onClick={() => {const m = prompt('倒數分鐘?','10'); if(m) {setCountdown(parseInt(m)*60); setDiscussionOverlay('countdown');}}} className="p-3 bg-blue-100 text-blue-600 rounded-xl text-[10px] font-black">研討倒數</button>
               <button onClick={() => {const t = prompt('時間?','14:00'); if(t) {setNextClassTime(t); setDiscussionOverlay('class');}}} className="p-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black">上課時間</button>
               <button onClick={() => setDiscussionOverlay('clock')} className="p-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black">顯示時鐘</button>
            </div>
            <div className="h-40 overflow-y-auto border-t pt-4 space-y-1 custom-scrollbar">
               {lines.map((line, i) => (
                 <button key={i} onClick={() => setCurrentLineIdx(i)} className={`w-full text-left p-2 rounded-lg text-[10px] transition ${i === currentLineIdx ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-400'}`}>
                   {i + 1}. {line.substring(0, 20)}...
                 </button>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className={`h-16 bg-white/90 backdrop-blur-md border-b flex items-center justify-between px-6 z-50 transition-opacity ${viewMode === 'overlay' ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSetup(true)} className="text-slate-400 font-black text-[10px] uppercase">Setup</button>
          <button onClick={() => setShowHelper(!showHelper)} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition ${showHelper ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600'}`}>播放助手</button>
        </div>

        <div className="flex items-center space-x-4">
           <input type="range" min="16" max="150" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-32 accent-blue-600" />
           <div className="flex bg-slate-100 p-1 rounded-lg">
              {(['reader', 'presenter', 'overlay'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-4 py-1.5 text-[10px] font-black rounded-md transition ${viewMode === m ? 'bg-white text-blue-600 shadow' : 'text-slate-400'}`}>{m}</button>
              ))}
           </div>
           {viewMode === 'overlay' && (
             <button onClick={() => setOverlayPos(p => p === 'bottom' ? 'top' : 'bottom')} className="bg-slate-100 px-2 py-1.5 rounded text-[10px] font-black text-slate-400">{overlayPos}</button>
           )}
        </div>
      </div>

      <div className="flex-1 relative flex flex-col overflow-hidden">
        
        {viewMode === 'reader' && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-10 px-6 sm:px-12 scroll-smooth">
            <div className="mx-auto transition-all" style={{ maxWidth: contentWidth >= 2000 ? '100%' : `${contentWidth}px`, fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334155' }} dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        {viewMode === 'presenter' && (
          <div className="flex-1 relative flex flex-col items-center justify-center" onClick={nextLine}>
            {bgImageUrl && <img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover" alt="BG" />}
            <div className="absolute inset-0 bg-black/20" />
            <div className={`relative z-20 flex flex-col items-center justify-center text-center transition-opacity duration-300 ${hideText ? 'opacity-0' : 'opacity-100'}`} 
                 style={{ width: `${presW}%`, height: `${presH}%`, bottom: '5%', position: 'absolute' }}>
               <div className="w-full h-full bg-black/60 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 flex items-center justify-center shadow-2xl">
                 <div style={{ fontSize: `${fontSize * 1.5}px`, color: 'white', fontWeight: 800, lineHeight: '1.4' }}>
                   {lines[currentLineIdx] || "END"}
                 </div>
               </div>
               <div className="mt-4 text-white/30 text-[10px] font-mono tracking-[0.2em]">{currentLineIdx + 1} / {lines.length}</div>
            </div>
          </div>
        )}

        {viewMode === 'overlay' && (
          <div className={`flex-1 flex flex-col px-10 ${overlayPos === 'bottom' ? 'justify-end pb-20' : 'justify-start pt-20'} ${hideText ? 'opacity-0' : 'opacity-100'}`} onClick={nextLine}>
             <div className="text-center" 
                  style={{ 
                    fontSize: `${fontSize * 1.8}px`, 
                    color: 'white', 
                    fontWeight: 900,
                    maxWidth: '100vw',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    textShadow: '4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000'
                  }}>
                {lines[currentLineIdx] || ""}
             </div>
          </div>
        )}

      </div>

      {audioUrl && viewMode !== 'overlay' && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-40">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl h-10" />
        </div>
      )}
    </div>
  );
}
