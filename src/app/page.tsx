"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function VoxReader() {
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [isSetup, setIsSetup] = useState(true);

  const [content, setContent] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

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
      
      // 清理 Google Docs 帶來的干擾樣式與空標籤
      doc.querySelectorAll('style, script, img, span[style*="position:fixed"]').forEach(el => el.remove());
      
      const bodyContent = doc.querySelector('body')?.innerHTML || '';
      setContent(bodyContent);
      setIsSetup(false);
      setCurrentPage(0);
    } catch (err) {
      alert('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  // 核心：使用 scroll-snap 確保對齊，並精確計算頁數
  useEffect(() => {
    if (!contentRef.current || isSetup) return;
    
    const updatePages = () => {
      const el = contentRef.current;
      if (el) {
        // 關鍵：使用容器實際寬度作為步進單位
        const viewW = el.getBoundingClientRect().width;
        const totalW = el.scrollWidth;
        // 增加一個微小的容錯值避免浮點數計算導致多出一頁
        const pages = Math.max(1, Math.round(totalW / viewW));
        setTotalPages(pages);
      }
    };

    // 延遲執行確保瀏覽器渲染完成
    const timer = setTimeout(updatePages, 500);
    window.addEventListener('resize', updatePages);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePages);
    };
  }, [content, fontSize, isSetup]);

  const goToPage = (page: number) => {
    const targetPage = Math.max(0, Math.min(totalPages - 1, page));
    setCurrentPage(targetPage);
    if (contentRef.current) {
      const viewW = contentRef.current.getBoundingClientRect().width;
      contentRef.current.scrollTo({
        left: targetPage * viewW,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSetup) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goToPage(currentPage + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPage(currentPage - 1); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup, totalPages, currentPage]);

  const getDirectAudioUrl = (url: string) => {
    if (url.includes('drive.google.com')) {
      const id = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
      return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
    }
    return url;
  };

  if (isSetup) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-sans">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-800 text-center">VoxReader</h1>
          <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-3 border rounded-lg" />
          <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結 (選填)" className="w-full p-3 border rounded-lg" />
          <button onClick={handleLoad} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">{loading ? '載入中...' : '開始視聽'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-100 overflow-hidden">
      {/* 頂部進度條 */}
      <div className="absolute top-0 left-0 h-1 bg-blue-500 z-30 transition-all duration-300" style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />

      <div className="h-14 flex items-center justify-between px-6 bg-white border-b z-20">
        <button onClick={() => setIsSetup(true)} className="text-slate-500 text-sm">← 返回</button>
        <input type="range" min="16" max="60" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-24 accent-blue-600" />
        <div className="text-slate-500 text-xs font-mono">{currentPage + 1} / {totalPages}</div>
      </div>

      {/* 閱讀容器：強制對齊視窗 */}
      <div className="flex-1 relative bg-stone-100" 
           onClick={(e) => {
             const x = e.clientX;
             const w = window.innerWidth;
             if (x > w * 0.7) goToPage(currentPage + 1);
             if (x < w * 0.3) goToPage(currentPage - 1);
           }}>
        <div ref={contentRef} 
             className="h-full w-full overflow-x-hidden scroll-smooth"
             style={{ 
               display: 'block',
               columnWidth: '100vw',
               columnGap: '40px', // 設定 Gap 讓內容分塊更明顯
               columnFill: 'auto',
               fontSize: `${fontSize}px`, 
               lineHeight: '1.8',
               padding: '20px 20px', // 固定內邊距，不使用百分比
               boxSizing: 'border-box',
               color: '#2d3748',
               WebkitOverflowScrolling: 'touch'
             }}
             dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      {audioUrl && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-20">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-2xl h-8" />
        </div>
      )}
    </div>
  );
}
