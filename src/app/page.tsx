"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function VoxReader() {
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [isSetup, setIsSetup] = useState(true);

  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedDoc = localStorage.getItem('vox-doc-url');
    const savedAudio = localStorage.getItem('vox-audio-url');
    if (savedDoc) setDocUrl(savedDoc);
    if (savedAudio) setAudioUrl(savedAudio);
  }, []);

  const handleLoad = async () => {
    if (!docUrl) return;
    setLoading(true);
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 清理樣式，但保持結構
      doc.querySelectorAll('style, script, img').forEach(el => el.remove());
      const bodyContent = doc.querySelector('body')?.innerHTML || '';
      
      setContent(bodyContent);
      setIsSetup(false);
    } catch (err) {
      alert('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  // 簡單的點擊翻頁（捲動一個視窗高度）
  const scrollPage = (dir: 'next' | 'prev') => {
    if (scrollRef.current) {
      const viewH = scrollRef.current.clientHeight;
      const currentScroll = scrollRef.current.scrollTop;
      scrollRef.current.scrollTo({
        top: dir === 'next' ? currentScroll + viewH : currentScroll - viewH,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSetup) return;
      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); scrollPage('next'); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); scrollPage('prev'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup]);

  const getDirectAudioUrl = (url: string) => {
    if (url.includes('drive.google.com')) {
      const id = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
      return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
    }
    return url;
  };

  if (isSetup) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl space-y-6">
          <h1 className="text-2xl font-bold text-center">VoxReader</h1>
          <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-3 border rounded-lg" />
          <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結" className="w-full p-3 border rounded-lg" />
          <button onClick={handleLoad} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">進入視聽</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-50 overflow-hidden">
      {/* 頂部工具列 */}
      <div className="h-14 flex items-center justify-between px-6 bg-white border-b z-20">
        <button onClick={() => setIsSetup(true)} className="text-slate-500">← 返回</button>
        <input type="range" min="16" max="60" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-32 accent-blue-600" />
        <div className="w-10" /> 
      </div>

      {/* 閱讀主體：改回垂直分段捲動，這在所有設備都最穩定 */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-smooth"
        onClick={(e) => {
          const y = e.clientY;
          const h = window.innerHeight;
          // 點擊螢幕下半部翻下一頁，上半部上一頁
          if (y > h * 0.6) scrollPage('next');
          else if (y < h * 0.3) scrollPage('prev');
        }}
      >
        <div 
          className="max-w-4xl mx-auto py-10 px-6 sm:px-12"
          style={{ fontSize: `${fontSize}px`, lineHeight: '1.8', color: '#334155' }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>

      {/* 底部播放器 */}
      {audioUrl && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-20 shadow-inner">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-2xl h-8" />
        </div>
      )}
    </div>
  );
}
