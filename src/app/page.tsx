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
  }, []);

  const handleLoad = async () => {
    if (!docUrl) return;
    setLoading(true);
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-bg-url', bgImageUrl);
    localStorage.setItem('vox-content-width', contentWidth.toString());
    localStorage.setItem('vox-font-size', fontSize.toString());

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const rawText = await res.text();
      
      // Error JSON check
      try {
        const jsonData = JSON.parse(rawText);
        if (jsonData.error) throw new Error(jsonData.error);
      } catch (e: any) { if (!e.message.includes('JSON')) throw e; }

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      
      // Clean content
      const target = doc.querySelector('#contents') || doc.body;
      target.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
      
      // Extract lines for Presenter/Overlay mode
      const rawLines = target.innerText
        .split(/[。\n！？]/)
        .map(l => l.trim())
        .filter(l => l.length > 1);
      
      setLines(rawLines);
      
      // Reader HTML
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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-100">
        <div className="w-full max-w-xl bg-white p-10 rounded-3xl shadow-2xl space-y-6">
          <h1 className="text-3xl font-black text-slate-800 text-center tracking-tighter italic">VoxReader Pro</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">數據來源</label>
              <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-3 bg-slate-50 border-none rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結 (選填)" className="w-full p-3 bg-slate-50 border-none rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-4">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">播放設定</label>
              <input type="text" value={bgImageUrl} onChange={(e) => setBgImageUrl(e.target.value)} placeholder="講師背景圖網址" className="w-full p-3 bg-slate-50 border-none rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                 <span className="text-sm text-slate-500">寬度: {contentWidth}px</span>
                 <input type="range" min="400" max="2000" step="100" value={contentWidth} onChange={(e) => setContentWidth(parseInt(e.target.value))} className="w-24 accent-blue-600" />
              </div>
            </div>
          </div>

          <button onClick={handleLoad} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xl hover:bg-blue-700 transition-all transform hover:scale-[1.02] shadow-lg shadow-blue-200">
            {loading ? '解析中...' : '進入視聽系統'}
          </button>
        </div>
      </div>
    );
  }

  // --- RENDERING MODES ---

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-500 ${viewMode === 'overlay' ? '' : 'bg-stone-50'}`}
         style={viewMode === 'overlay' ? { backgroundColor: overlayBg } : {}}>
      
      {/* Global Toolbar (Auto-hide in overlay) */}
      <div className={`h-16 bg-white border-b flex items-center justify-between px-6 z-50 transition-opacity ${viewMode === 'overlay' ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSetup(true)} className="text-slate-400 hover:text-slate-800 transition">← 設定</button>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['reader', 'presenter', 'overlay'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === m ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>
                {m === 'reader' ? '閱覽' : m === 'presenter' ? '講師' : '字幕'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-6">
           <input type="range" min="16" max="120" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-24 accent-blue-600" />
           {viewMode === 'overlay' && (
             <div className="flex space-x-2">
                <button onClick={() => setOverlayBg(prev => prev === '#00FF00' ? '#000000' : '#00FF00')} className="w-6 h-6 rounded-full border shadow" style={{backgroundColor: overlayBg === '#00FF00' ? '#000000' : '#00FF00'}} title="切換黑/綠幕" />
                <button onClick={() => setOverlayPos(prev => prev === 'bottom' ? 'top' : 'bottom')} className="text-xs font-bold px-2 py-1 bg-slate-200 rounded">位置: {overlayPos}</button>
             </div>
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        
        {/* MODE: READER */}
        {viewMode === 'reader' && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-10 px-6 sm:px-12 scroll-smooth">
            <div className="mx-auto transition-all duration-300" style={{ maxWidth: contentWidth >= 2000 ? '100%' : `${contentWidth}px`, fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334155' }} dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        {/* MODE: PRESENTER (Lecturer) */}
        {viewMode === 'presenter' && (
          <div className="flex-1 relative flex flex-col items-center justify-end pb-20" onClick={nextLine}>
            {bgImageUrl && <img src={bgImageUrl} className="absolute inset-0 w-full h-full object-cover z-0" alt="Background" />}
            <div className="absolute inset-0 bg-black/20 z-10" />
            <div className="relative z-20 w-[90%] max-w-5xl bg-black/60 backdrop-blur-md p-10 rounded-3xl border border-white/20 text-center shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div style={{ fontSize: `${fontSize * 1.5}px`, color: 'white', fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                 {lines[currentLineIdx] || "內容結束"}
               </div>
               <div className="mt-4 text-white/40 text-xs font-mono uppercase tracking-widest">{currentLineIdx + 1} / {lines.length}</div>
            </div>
          </div>
        )}

        {/* MODE: OVERLAY (Broadcast) */}
        {viewMode === 'overlay' && (
          <div className={`flex-1 flex flex-col p-20 ${overlayPos === 'bottom' ? 'justify-end' : 'justify-start'}`} onClick={nextLine}>
             <div className="text-center transition-all duration-300" style={{ fontSize: `${fontSize * 2}px`, color: 'white', fontWeight: 900, textShadow: '3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' }}>
                {lines[currentLineIdx] || ""}
             </div>
          </div>
        )}

      </div>

      {/* Global Audio (Optional) */}
      {audioUrl && viewMode !== 'overlay' && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-40 shadow-inner">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl h-8" />
        </div>
      )}
    </div>
  );
}
