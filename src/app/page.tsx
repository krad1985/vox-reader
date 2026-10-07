"use client";

import React, { useState, useEffect, useRef } from 'react';

type ViewMode = 'reader' | 'presenter' | 'overlay';

export default function VoxReader() {
  // Config States
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('reader');
  const [overlayBg, setOverlayBg] = useState<'#00FF00' | '#000000'>('#00FF00');
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');
  
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
    const savedMode = localStorage.getItem('vox-last-mode') as ViewMode;
    if (savedMode) setViewMode(savedMode);
  }, []);

  const handleLoad = async () => {
    if (!docUrl) return;
    setLoading(true);
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-bg-url', bgImageUrl);
    localStorage.setItem('vox-content-width', contentWidth.toString());
    localStorage.setItem('vox-font-size', fontSize.toString());
    localStorage.setItem('vox-last-mode', viewMode);

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const rawText = await res.text();
      
      try {
        const jsonData = JSON.parse(rawText);
        if (jsonData.error) throw new Error(jsonData.error);
      } catch (e: any) { if (!e.message.includes('JSON')) throw e; }

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      
      const target = doc.querySelector('#contents') || doc.body;
      target.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
      
      const rawLines = ((target as HTMLElement).innerText || target.textContent || "")
        .split(/[。\n！？]/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 1);
      
      setLines(rawLines);
      
      target.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style');
        el.removeAttribute('class');
      });
      setContent(target.innerHTML);
      
      setIsSetup(false);
      setCurrentLineIdx(0);
    } catch (err: any) {
      alert('載入失敗: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const nextLine = () => setCurrentLineIdx(prev => Math.min(lines.length - 1, prev + 1));
  const prevLine = () => setCurrentLineIdx(prev => Math.max(0, prev - 1));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSetup) return;
      if (viewMode === 'reader') {
        if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); scrollRef.current?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); }
        if (e.key === 'ArrowUp') { e.preventDefault(); scrollRef.current?.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); }
      } else {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); nextLine(); }
        if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'ArrowUp') { e.preventDefault(); prevLine(); }
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
        <div className="w-full max-w-3xl bg-white p-10 rounded-[2.5rem] shadow-2xl space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter italic">VoxReader Pro v2.1</h1>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.3em]">Audio Visual Integration System</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 uppercase border-l-4 border-blue-600 pl-2">1. 數據源與音檔</h2>
              <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 outline-none focus:border-blue-500 transition-all" />
              <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結 (選填)" className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 outline-none focus:border-blue-500 transition-all" />
            </div>
            
            <div className="space-y-4">
              <h2 className="text-xs font-black text-blue-600 uppercase border-l-4 border-blue-600 pl-2">2. 模式與外觀</h2>
              <div className="flex bg-slate-50 p-1 rounded-2xl border-2 border-slate-100">
                {(['reader', 'presenter', 'overlay'] as ViewMode[]).map(m => (
                  <button key={m} onClick={() => setViewMode(m)} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${viewMode === m ? 'bg-white shadow-md text-blue-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
                    {m === 'reader' ? '閱覽模式' : m === 'presenter' ? '講師模式' : '字幕模式'}
                  </button>
                ))}
              </div>
              {viewMode === 'presenter' && (
                <input type="text" value={bgImageUrl} onChange={(e) => setBgImageUrl(e.target.value)} placeholder="講師背景圖 URL" className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 outline-none focus:border-blue-500 transition-all animate-in fade-in zoom-in-95" />
              )}
              {viewMode === 'reader' && (
                 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <span className="text-sm font-bold text-slate-500">閱讀寬度</span>
                    <input type="range" min="400" max="2000" step="100" value={contentWidth} onChange={(e) => setContentWidth(parseInt(e.target.value))} className="w-32 accent-blue-600" />
                 </div>
              )}
            </div>
          </div>

          <button onClick={handleLoad} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-xl hover:bg-blue-600 transition-all transform hover:scale-[1.01] active:scale-95 shadow-xl">
            {loading ? 'SYSTEM LOADING...' : '啟動視聽介面'}
          </button>
          
          <p className="text-center text-slate-300 text-[10px] font-bold tracking-widest">PERSONAL USE ONLY • VOXREADER v2.0</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-500 ${viewMode === 'overlay' ? '' : 'bg-stone-50'}`}
         style={viewMode === 'overlay' ? { backgroundColor: overlayBg } : {}}>
      
      <div className={`h-16 bg-white/80 backdrop-blur-md border-b flex items-center justify-between px-6 z-50 transition-opacity ${viewMode === 'overlay' ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSetup(true)} className="px-4 py-2 bg-slate-100 rounded-xl text-slate-600 text-xs font-black hover:bg-slate-200 transition">← 返回設定</button>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['reader', 'presenter', 'overlay'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${viewMode === m ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>
                {m === 'reader' ? '閱覽' : m === 'presenter' ? '講師' : '字幕'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-6">
           <div className="flex items-center space-x-2">
             <span className="text-[10px] font-black text-slate-300">SIZE</span>
             <input type="range" min="16" max="150" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-24 sm:w-32 accent-blue-600" />
           </div>
           {viewMode === 'overlay' && (
             <div className="flex bg-slate-100 p-1 rounded-xl space-x-1">
                <button onClick={() => setOverlayBg('#00FF00')} className={`w-8 h-8 rounded-lg border-2 ${overlayBg === '#00FF00' ? 'border-blue-500' : 'border-transparent'}`} style={{backgroundColor: '#00FF00'}} />
                <button onClick={() => setOverlayBg('#000000')} className={`w-8 h-8 rounded-lg border-2 ${overlayBg === '#000000' ? 'border-blue-500' : 'border-transparent'}`} style={{backgroundColor: '#000000'}} />
                <button onClick={() => setOverlayPos(prev => prev === 'bottom' ? 'top' : 'bottom')} className="px-3 text-[10px] font-black text-slate-500 uppercase">{overlayPos}</button>
             </div>
           )}
        </div>
      </div>

      <div className="flex-1 relative flex flex-col overflow-hidden">
        
        {viewMode === 'reader' && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-10 px-6 sm:px-12 scroll-smooth">
            <div className="mx-auto transition-all duration-300" style={{ maxWidth: contentWidth >= 2000 ? '100%' : `${contentWidth}px`, fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334155' }} dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        {viewMode === 'presenter' && (
          <div className="flex-1 relative flex flex-col items-center justify-end pb-20" onClick={nextLine}>
            {bgImageUrl && <img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="Background" />}
            <div className="absolute inset-0 bg-black/30 z-10" />
            <div className="relative z-20 w-[92%] max-w-6xl bg-black/60 backdrop-blur-xl p-12 rounded-[3rem] border border-white/10 text-center shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
               <div style={{ fontSize: `${fontSize * 1.8}px`, color: 'white', fontWeight: 800, textShadow: '0 4px 20px rgba(0,0,0,0.6)', lineHeight: '1.4' }}>
                 {lines[currentLineIdx] || "內容結束"}
               </div>
               <div className="mt-8 flex items-center justify-center space-x-4">
                  <div className="h-1 flex-1 max-w-[100px] bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((currentLineIdx + 1) / lines.length) * 100}%` }} />
                  </div>
                  <span className="text-white/30 text-[10px] font-black font-mono tracking-tighter">{currentLineIdx + 1} / {lines.length}</span>
               </div>
            </div>
          </div>
        )}

        {viewMode === 'overlay' && (
          <div className={`flex-1 flex flex-col p-20 ${overlayPos === 'bottom' ? 'justify-end' : 'justify-start'}`} onClick={nextLine}>
             <div className="text-center transition-all duration-300" 
                  style={{ 
                    fontSize: `${fontSize * 2.2}px`, 
                    color: 'white', 
                    fontWeight: 900, 
                    lineHeight: '1.2',
                    textShadow: '4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 10px 30px rgba(0,0,0,0.5)' 
                  }}>
                {lines[currentLineIdx] || ""}
             </div>
          </div>
        )}

      </div>

      {audioUrl && viewMode !== 'overlay' && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl h-10" />
        </div>
      )}
    </div>
  );
}
