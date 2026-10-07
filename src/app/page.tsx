"use client";

import React, { useState, useEffect, useRef } from 'react';

type ViewMode = 'reader' | 'presenter' | 'overlay';

export default function VoxReader() {
  // --- States ---
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('reader');
  const [overlayBg, setOverlayBg] = useState<'#00FF00' | '#000000'>('#00FF00');
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');
  
  // Presenter Customization
  const [presW, setPresW] = useState(90); // %
  const [presH, setPresH] = useState(30); // %
  
  // Discussion Tools
  const [showClock, setShowClock] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [nextClassTime, setNextClassTime] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  const [isSetup, setIsSetup] = useState(true);
  const [content, setContent] = useState<string>('');
  const [lines, setLines] = useState<string[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    setDocUrl(localStorage.getItem('vox-doc-url') || '');
    setAudioUrl(localStorage.getItem('vox-audio-url') || '');
    setBgImageUrl(localStorage.getItem('vox-bg-url') || '');
    setContentWidth(parseInt(localStorage.getItem('vox-content-width') || '800'));
    setFontSize(parseInt(localStorage.getItem('vox-font-size') || '24'));
    setPresW(parseInt(localStorage.getItem('vox-pres-w') || '90'));
    setPresH(parseInt(localStorage.getItem('vox-pres-h') || '30'));
  }, []);

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})), 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown Logic
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs < 10 ? '0' : ''}${rs}`;
  };

  const handleLoad = async () => {
    if (!docUrl) return;
    setLoading(true);
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-bg-url', bgImageUrl);
    localStorage.setItem('vox-content-width', contentWidth.toString());
    localStorage.setItem('vox-font-size', fontSize.toString());
    localStorage.setItem('vox-pres-w', presW.toString());
    localStorage.setItem('vox-pres-h', presH.toString());

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const rawText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const target = doc.querySelector('#contents') || doc.body;
      target.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
      
      // Smart Line Splitting (針對字幕優化)
      const rawLines = target.innerText
        .split(/[。\n！？]/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 1);
      
      setLines(rawLines);
      
      target.querySelectorAll('*').forEach(el => { el.removeAttribute('style'); el.removeAttribute('class'); });
      setContent(target.innerHTML);
      setIsSetup(false);
      setCurrentLineIdx(0);
    } catch (err: any) {
      alert('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  const nextLine = () => setCurrentLineIdx(prev => Math.min(lines.length - 1, prev + 1));
  const prevLine = () => setCurrentLineIdx(prev => Math.max(0, prev - 1));

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
        <div className="w-full max-w-3xl bg-white p-10 rounded-[2.5rem] shadow-2xl space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-black text-slate-800 italic">VoxReader Pro v2.2</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 border-l-4 border-blue-600 pl-2">1. 數據源</h2>
              <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" />
              <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" />
              <input type="text" value={bgImageUrl} onChange={(e) => setBgImageUrl(e.target.value)} placeholder="講師圖片網址" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" />
            </div>
            
            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 border-l-4 border-blue-600 pl-2">2. 模式切換</h2>
              <div className="flex bg-slate-50 p-1 rounded-2xl">
                {(['reader', 'presenter', 'overlay'] as ViewMode[]).map(m => (
                  <button key={m} onClick={() => setViewMode(m)} className={`flex-1 py-3 text-xs font-bold rounded-xl transition ${viewMode === m ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>
                    {m === 'reader' ? '閱覽' : m === 'presenter' ? '講師' : '字幕'}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400">文字區塊寬度 ({presW}%) / 高度 ({presH}%)</label>
                <div className="flex space-x-2">
                  <input type="range" min="30" max="100" value={presW} onChange={(e) => setPresW(parseInt(e.target.value))} className="flex-1 accent-blue-600" />
                  <input type="range" min="10" max="80" value={presH} onChange={(e) => setPresH(parseInt(e.target.value))} className="flex-1 accent-blue-400" />
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleLoad} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-xl hover:bg-blue-600 transition-all">
            啟動讀書會視聽
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-500`}
         style={viewMode === 'overlay' ? { backgroundColor: overlayBg } : { backgroundColor: '#f5f5f4' }}>
      
      {/* Discussion Widgets Overlay */}
      {(showClock || countdown !== null || nextClassTime) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="bg-black/80 backdrop-blur-2xl p-16 rounded-[4rem] border border-white/20 text-center space-y-6 pointer-events-auto shadow-2xl animate-in zoom-in-95 duration-300">
            {countdown !== null && (
              <div className="space-y-2">
                <div className="text-blue-400 text-sm font-bold tracking-[0.5em] uppercase">研討倒數</div>
                <div className="text-[12rem] font-black text-white leading-none tabular-nums tracking-tighter">{formatCountdown(countdown)}</div>
              </div>
            )}
            {nextClassTime && (
              <div className="space-y-1">
                <div className="text-slate-400 text-sm font-bold uppercase">下堂課時間</div>
                <div className="text-6xl font-bold text-white">{nextClassTime}</div>
              </div>
            )}
            <div className="text-2xl font-mono text-slate-500">{currentTime}</div>
            <button onClick={() => {setShowClock(false); setCountdown(null); setNextClassTime('');}} className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition">關閉儀表板</button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={`h-16 bg-white/90 backdrop-blur-md border-b flex items-center justify-between px-6 z-50 transition-opacity ${viewMode === 'overlay' ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSetup(true)} className="text-slate-400 font-black text-xs uppercase tracking-widest">Setup</button>
          <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => {const m = prompt('倒數分鐘?','10'); if(m) setCountdown(parseInt(m)*60);}} className="px-3 py-1 text-[10px] font-black bg-white rounded shadow">研討倒數</button>
            <button onClick={() => {const t = prompt('上課時間?','14:00'); if(t) setNextClassTime(t);}} className="px-3 py-1 text-[10px] font-black bg-white rounded shadow">上課時間</button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
           <input type="range" min="16" max="150" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-32 accent-blue-600" />
           <div className="flex bg-slate-100 p-1 rounded-lg">
              {(['reader', 'presenter', 'overlay'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-4 py-1.5 text-[10px] font-black rounded-md transition ${viewMode === m ? 'bg-white text-blue-600 shadow' : 'text-slate-400'}`}>{m}</button>
              ))}
           </div>
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
            <div className="relative z-20 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-10 duration-700" 
                 style={{ width: `${presW}%`, height: `${presH}%`, bottom: viewMode === 'presenter' ? '5%' : 'auto', position: 'absolute' }}>
               <div className="w-full h-full bg-black/60 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 flex items-center justify-center shadow-2xl">
                 <div style={{ fontSize: `${fontSize * 1.5}px`, color: 'white', fontWeight: 800, lineHeight: '1.4' }}>
                   {lines[currentLineIdx] || "END"}
                 </div>
               </div>
               <div className="mt-4 text-white/20 text-[10px] font-mono">{currentLineIdx + 1} / {lines.length}</div>
            </div>
          </div>
        )}

        {viewMode === 'overlay' && (
          <div className={`flex-1 flex flex-col ${overlayPos === 'bottom' ? 'justify-end pb-20' : 'justify-start pt-20'}`} onClick={nextLine}>
             <div className="text-center px-[10%]" 
                  style={{ 
                    fontSize: `${fontSize * 2}px`, 
                    color: 'white', 
                    fontWeight: 900,
                    // 強制單行與字數邏輯：由 padding 與 maxWidth 隱含控制
                    maxWidth: '100vw',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    textShadow: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
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
