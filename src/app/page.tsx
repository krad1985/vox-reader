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

  // Calculate Total Pages based on scrollWidth
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
  const navigate = (dir: 'next' | 'prev') => {
    const newPage = dir === 'next' 
      ? Math.min(totalPages - 1, currentPage + 1)
      : Math.max(0, currentPage - 1);
    
    setCurrentPage(newPage);
    if (contentRef.current) {
      contentRef.current.scrollTo({
        left: newPage * contentRef.current.clientWidth,
        behavior: 'smooth'
      });
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
            <div>
              <label className="block text-sm font-medium text-slate-600">Google 文件連結</label>
              <input 
                type="text" 
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/..."
                className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-600">Google Drive 音檔連結</label>
              <input 
                type="text" 
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
              />
            </div>
          </div>

          <button 
            onClick={handleLoad}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-blue-300"
          >
            {loading ? '載入中...' : '開始視聽'}
          </button>
          <p className="text-xs text-slate-400 text-center">提示：文件需設定為「知道連結的人均可檢視」</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-100 overflow-hidden select-none">
      {/* Header Controls */}
      <div className="h-16 flex items-center justify-between px-6 bg-white border-b shadow-sm z-20">
        <button onClick={() => setIsSetup(true)} className="text-slate-500 hover:text-slate-800 font-medium">← 返回</button>
        
        <div className="flex items-center space-x-4">
          <span className="text-sm text-slate-500 hidden sm:inline">字體: {fontSize}px</span>
          <input 
            type="range" min="16" max="72" value={fontSize} 
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="w-24 sm:w-32 accent-blue-600"
          />
        </div>

        <div className="text-slate-500 text-sm">
          {currentPage + 1} / {totalPages}
        </div>
      </div>

      {/* Reader Area */}
      <div 
        className="flex-1 relative overflow-hidden"
        onClick={(e) => {
           const width = window.innerWidth;
           if (e.clientX > width * 0.7) navigate('next');
           if (e.clientX < width * 0.3) navigate('prev');
        }}
      >
        <div 
          ref={contentRef}
          className="h-full w-full overflow-hidden transition-all duration-300 ease-in-out"
          style={{ 
            columnWidth: '100vw',
            columnGap: '0px',
            columnFill: 'auto',
            fontSize: `${fontSize}px`, 
            lineHeight: '1.8',
            padding: '40px 10%',
            wordBreak: 'break-word'
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>

      {/* Footer Player */}
      {audioUrl && (
        <div className="h-24 bg-white border-t flex items-center justify-center px-4 sm:px-10 shadow-lg z-20">
          <audio 
            controls 
            src={getDirectAudioUrl(audioUrl)} 
            className="w-full max-w-3xl"
          />
        </div>
      )}

      {/* Navigation Buttons (Desktop) */}
      <div className="fixed bottom-28 right-4 hidden sm:flex flex-col space-y-2 opacity-30 hover:opacity-100 transition z-30">
        <button onClick={() => navigate('prev')} className="p-3 bg-white rounded-full shadow border">上頁</button>
        <button onClick={() => navigate('next')} className="p-3 bg-white rounded-full shadow border">下頁</button>
      </div>
    </div>
  );
}
