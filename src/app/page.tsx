"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function VoxReader() {
  // Config States
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [isSetup, setIsSetup] = useState(true);

  // Content States
  const [content, setContent] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // Load from LocalStorage
  useEffect(() => {
    const savedDoc = localStorage.getItem('vox-doc-url');
    const savedAudio = localStorage.getItem('vox-audio-url');
    if (savedDoc) setDocUrl(savedDoc);
    if (savedAudio) setAudioUrl(savedAudio);
  }, []);

  // Handle Loading Content
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
      const styleTags = doc.querySelectorAll('style');
      styleTags.forEach(t => t.remove());
      
      const bodyContent = doc.querySelector('body')?.innerHTML || '';
      setContent(bodyContent);
      setIsSetup(false);
      setCurrentPage(0);
    } catch (err) {
      alert('載入失敗，請確認網址是否已設定為公開檢視');
    } finally {
      setLoading(false);
    }
  };

  // Calculate Total Pages
  useEffect(() => {
    if (!contentRef.current || isSetup) return;
    
    const updatePages = () => {
      const el = contentRef.current;
      if (el) {
        const totalW = el.scrollWidth;
        const viewW = el.clientWidth;
        const pages = Math.max(1, Math.ceil(totalW / (viewW || 1)));
        setTotalPages(pages);
      }
    };

    const timer = setTimeout(updatePages, 500);
    window.addEventListener('resize', updatePages);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePages);
    };
  }, [content, fontSize, isSetup]);

  // Navigation Logic
  const goToPage = (page: number) => {
    const targetPage = Math.max(0, Math.min(totalPages - 1, page));
    setCurrentPage(targetPage);
    if (contentRef.current) {
      contentRef.current.scrollTo({
        left: targetPage * contentRef.current.clientWidth,
        behavior: 'smooth'
      });
    }
  };

  const navigate = (dir: 'next' | 'prev') => {
    goToPage(dir === 'next' ? currentPage + 1 : currentPage - 1);
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSetup) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        navigate('next');
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetup, totalPages, currentPage]);

  const handleJump = () => {
    const p = prompt(`跳轉頁碼 (1-${totalPages})`, (currentPage + 1).toString());
    if (p) {
      const pageNum = parseInt(p);
      if (!isNaN(pageNum)) goToPage(pageNum - 1);
    }
  };

  // Audio URL Converter
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
          <h1 className="text-3xl font-bold text-slate-800 text-center">VoxReader 閱聽助手</h1>
          <div className="space-y-4">
            <input 
              type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)}
              placeholder="Google 文件連結..."
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
            />
            <input 
              type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="Google Drive 音檔連結..."
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
            />
          </div>
          <button onClick={handleLoad} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-blue-300">
            {loading ? '載入中...' : '開始視聽'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-100 overflow-hidden select-none">
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-30" style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />

      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 bg-white border-b shadow-sm z-20">
        <button onClick={() => setIsSetup(true)} className="text-slate-500 hover:text-slate-800 font-medium">← 返回</button>
        <div className="flex items-center space-x-4">
          <input type="range" min="16" max="72" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-24 sm:w-32 accent-blue-600" />
        </div>
        <button onClick={handleJump} className="text-slate-500 text-sm font-mono bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">
          {currentPage + 1} / {totalPages}
        </button>
      </div>

      {/* Reader Area */}
      <div className="flex-1 relative overflow-hidden" onClick={(e) => {
           const width = window.innerWidth;
           if (e.clientX > width * 0.75) navigate('next');
           if (e.clientX < width * 0.25) navigate('prev');
        }}>
        <div ref={contentRef} className="h-full w-full overflow-hidden transition-all duration-300 ease-in-out"
          style={{ 
            columnWidth: '100vw', columnGap: '0px', columnFill: 'auto',
            fontSize: `${fontSize}px`, lineHeight: '1.8', padding: '40px 10%', wordBreak: 'break-word'
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>

      {/* Footer Player */}
      {audioUrl && (
        <div className="h-24 bg-white border-t flex items-center justify-center px-4 shadow-lg z-20">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-3xl" />
        </div>
      )}
    </div>
  );
}
