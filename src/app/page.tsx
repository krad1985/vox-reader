"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function VoxReader() {
  // Config States
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [isSetup, setIsSetup] = useState(true);

  // Content States
  const [content, setContent] = useState<string[]>([]);
  const [pages, setPages] = useState<string[][]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

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
      
      // Basic Parser: Extracting paragraphs from HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const paragraphs = Array.from(doc.querySelectorAll('p, h1, h2, h3, li'))
        .map(el => el.outerHTML)
        .filter(html => html.length > 20); // Filter empty/short tags

      setContent(paragraphs);
      setIsSetup(false);
    } catch (err) {
      alert('載入失敗，請確認網址是否已發佈到網路');
    } finally {
      setLoading(false);
    }
  };

  // Pagination Logic (Simplified Semantic Pagination)
  useEffect(() => {
    if (content.length === 0 || isSetup) return;

    const paginateContent = () => {
      const newPages: string[][] = [];
      let currentPageItems: string[] = [];
      
      // 簡單估計：每一頁大約 800-1200 字元（視字體大小而定）
      const charsPerPage = Math.floor(20000 / fontSize); 
      let currentChars = 0;

      content.forEach(p => {
        const textLen = p.replace(/<[^>]*>/g, '').length;
        if (currentChars + textLen > charsPerPage && currentPageItems.length > 0) {
          newPages.push(currentPageItems);
          currentPageItems = [p];
          currentChars = textLen;
        } else {
          currentPageItems.push(p);
          currentChars += textLen;
        }
      });
      if (currentPageItems.length > 0) newPages.push(currentPageItems);
      setPages(newPages);
    };

    paginateContent();
  }, [content, fontSize, isSetup]);

  // Audio URL Converter
  const getDirectAudioUrl = (url: string) => {
    if (url.includes('drive.google.com')) {
      const id = url.match(/\/d\/(.+?)\//)?.[1];
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
              <label className="block text-sm font-medium text-slate-600">Google 文件發佈網址</label>
              <input 
                type="text" 
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/.../pub"
                className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-600">Google Drive 音檔連結</label>
              <input 
                type="text" 
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
          <p className="text-xs text-slate-400 text-center">提示：Google 文件需選擇「檔案 {" > "} 分享 {" > "} 發佈到網路」</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-100 overflow-hidden">
      {/* Header Controls */}
      <div className="h-16 flex items-center justify-between px-6 bg-white border-b shadow-sm z-10">
        <button onClick={() => setIsSetup(true)} className="text-slate-500 hover:text-slate-800 font-medium">← 返回設定</button>
        
        <div className="flex items-center space-x-4">
          <span className="text-sm text-slate-500">字體大小: {fontSize}px</span>
          <input 
            type="range" min="16" max="72" value={fontSize} 
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="w-32 accent-blue-600"
          />
        </div>

        <div className="text-slate-500 text-sm">
          頁次: {currentPage + 1} / {pages.length}
        </div>
      </div>

      {/* Reader Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto px-[10%] py-12 flex flex-col items-center"
        onClick={(e) => {
           const width = window.innerWidth;
           if (e.clientX > width * 0.7) setCurrentPage(Math.min(pages.length - 1, currentPage + 1));
           if (e.clientX < width * 0.3) setCurrentPage(Math.max(0, currentPage - 1));
        }}
      >
        <div 
          className="max-w-4xl w-full transition-all duration-300 ease-in-out"
          style={{ fontSize: `${fontSize}px`, lineHeight: '1.8' }}
          dangerouslySetInnerHTML={{ __html: pages[currentPage]?.join('') || '載入中...' }}
        />
      </div>

      {/* Footer Player */}
      {audioUrl && (
        <div className="h-24 bg-white border-t flex items-center justify-center px-10 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
          <audio 
            controls 
            src={getDirectAudioUrl(audioUrl)} 
            className="w-full max-w-3xl"
          />
        </div>
      )}

      {/* Key Controls */}
      <div className="fixed bottom-32 right-8 flex flex-col space-y-2 opacity-50 hover:opacity-100 transition">
        <button onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} className="p-3 bg-white rounded-full shadow border">上頁</button>
        <button onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))} className="p-3 bg-white rounded-full shadow border">下頁</button>
      </div>
    </div>
  );
}
