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
      
      // 核心：純淨化提取
      // 遍歷所有段落與標題，只保留文字與基本標籤，徹底去除 Google Docs 的原始樣式
      const elements = doc.querySelectorAll('p, h1, h2, h3, h4, li');
      let cleanHtml = '';
      elements.forEach(el => {
        const tag = el.tagName.toLowerCase();
        // 只保留標籤內容，不保留屬性 (id, class, style...)
        cleanHtml += `<${tag} style="margin-bottom: 1em;">${el.innerHTML}</${tag}>`;
      });
      
      if (!cleanHtml) cleanHtml = "<p>找不到可讀取的文字內容，請確認網址正確。</p>";

      setContent(cleanHtml);
      setIsSetup(false);
      setCurrentPage(0);
    } catch (err) {
      alert('載入失敗，請檢查連結');
    } finally {
      setLoading(false);
    }
  };

  // 監聽並計算頁數
  useEffect(() => {
    if (!contentRef.current || isSetup) return;
    
    const updatePages = () => {
      const el = contentRef.current;
      if (el) {
        const viewW = el.clientWidth;
        const totalW = el.scrollWidth;
        // 在 CSS Column 中，totalW 應該會隨內容增加而變寬
        const pages = Math.max(1, Math.round(totalW / viewW));
        setTotalPages(pages);
      }
    };

    // 延遲一點點等待渲染，確保 scrollWidth 準確
    const timer = setTimeout(updatePages, 600);
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
      const viewW = contentRef.current.clientWidth;
      contentRef.current.scrollTo({
        left: targetPage * viewW,
        behavior: 'smooth'
      });
    }
  };

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
          <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結" className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={handleLoad} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">{loading ? '載入中...' : '進入視聽'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-100 overflow-hidden select-none">
      <div className="absolute top-0 left-0 h-1 bg-blue-500 z-30 transition-all duration-300" style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />

      <div className="h-14 flex items-center justify-between px-6 bg-white border-b z-20">
        <button onClick={() => setIsSetup(true)} className="text-slate-500 text-sm">← 返回</button>
        <input type="range" min="16" max="60" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-24 accent-blue-600" />
        <div className="text-slate-500 text-xs font-mono">{currentPage + 1} / {totalPages}</div>
      </div>

      <div className="flex-1 relative" 
           onClick={(e) => {
             const x = e.clientX;
             const w = window.innerWidth;
             if (x > w * 0.75) goToPage(currentPage + 1);
             if (x < w * 0.25) goToPage(currentPage - 1);
           }}>
        <div ref={contentRef} 
             className="h-full w-full overflow-hidden"
             style={{ 
               columnWidth: '100vw',
               columnGap: '0px', 
               columnFill: 'auto',
               fontSize: `${fontSize}px`, 
               lineHeight: '1.8',
               padding: '40px 20px', 
               boxSizing: 'border-box',
               color: '#2d3748',
             }}
             dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      {audioUrl && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-20 shadow-lg">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-2xl h-8" />
        </div>
      )}
    </div>
  );
}
