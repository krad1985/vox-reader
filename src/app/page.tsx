"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function VoxReader() {
  const [docUrl, setDocUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [contentWidth, setContentWidth] = useState(800); // 預設 800px
  const [isSetup, setIsSetup] = useState(true);

  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedDoc = localStorage.getItem('vox-doc-url');
    const savedAudio = localStorage.getItem('vox-audio-url');
    const savedWidth = localStorage.getItem('vox-content-width');
    if (savedDoc) setDocUrl(savedDoc);
    if (savedAudio) setAudioUrl(savedAudio);
    if (savedWidth) setContentWidth(parseInt(savedWidth));
  }, []);

  const handleLoad = async () => {
    if (!docUrl) return;
    setLoading(true);
    localStorage.setItem('vox-doc-url', docUrl);
    localStorage.setItem('vox-audio-url', audioUrl);
    localStorage.setItem('vox-content-width', contentWidth.toString());

    try {
      const res = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const data = await res.json().catch(() => null);
      
      // 如果回傳的是 JSON 且包含 error，代表後端報錯了
      if (data && data.error) {
        throw new Error(data.debug ? `${data.error} ${data.debug.hint}` : data.error);
      }

      // 如果沒報錯，我們預期得到的是 HTML (但 fetch-doc 現在可能回傳 JSON 或 HTML)
      // 需要重新 fetch 一次或者調整 API 回傳邏輯。
      // 為了簡化，我讓 API 始終回傳 JSON 或 HTML。
      
      // 重新取得 HTML
      const htmlRes = await fetch(`/api/fetch-doc?url=${encodeURIComponent(docUrl)}`);
      const rawHtml = await htmlRes.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');
      
      // 優先抓取 export 格式的內容
      let bodyContent = '';
      const body = doc.querySelector('body');
      
      if (body) {
        // 徹底清除可能干擾的樣式，但保留文字結構
        body.querySelectorAll('style, script, img, iframe').forEach(el => el.remove());
        body.querySelectorAll('*').forEach(el => {
          el.removeAttribute('style');
          el.removeAttribute('class');
        });
        bodyContent = body.innerHTML;
      }

      if (!bodyContent || bodyContent.trim().length < 10) {
        throw new Error('EMPTY_CONTENT');
      }
      
      setContent(bodyContent);
      setIsSetup(false);
    } catch (err: any) {
      console.error('Fetch Error:', err);
      let msg = "內容讀取失敗。";
      if (err.message === 'AUTH_REQUIRED') {
        msg = "權限不足。請確認該 Google 文件已設定為「知道連結的人均可檢視」。";
      } else if (err.message === 'EMPTY_CONTENT') {
        msg = "抓取到了空白內容。請確認連結正確且文件內含有文字。";
      } else {
        msg = `讀取錯誤: ${err.message || '未知錯誤'}`;
      }
      setContent(`<p style='color: gray; padding: 20px;'>${msg}<br/><br/>提示：若持續失敗，請嘗試在文件中使用「檔案 > 分享 > 發佈到網路」並使用該連結。</p>`);
      setIsSetup(false);
    } finally {
      setLoading(false);
    }
  };

  const scrollPage = (dir: 'next' | 'prev') => {
    if (scrollRef.current) {
      const viewH = scrollRef.current.clientHeight;
      const currentScroll = scrollRef.current.scrollTop;
      scrollRef.current.scrollTo({
        top: dir === 'next' ? currentScroll + viewH * 0.9 : currentScroll - viewH * 0.9,
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
          <div className="space-y-4">
            <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Google Docs 連結" className="w-full p-3 border rounded-lg" />
            <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="音檔連結" className="w-full p-3 border rounded-lg" />
            
            <div className="space-y-2">
              <label className="text-sm text-slate-500">閱讀寬度: {contentWidth === 2000 ? '自動' : `${contentWidth}px`}</label>
              <input type="range" min="400" max="2000" step="50" value={contentWidth} onChange={(e) => setContentWidth(parseInt(e.target.value))} className="w-full accent-blue-600" />
            </div>
          </div>
          <button onClick={handleLoad} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">進入視聽</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-50 overflow-hidden">
      <div className="h-14 flex items-center justify-between px-6 bg-white border-b z-20">
        <button onClick={() => setIsSetup(true)} className="text-slate-500">← 返回</button>
        
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-400">字體</span>
            <input type="range" min="16" max="72" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-20 sm:w-32 accent-blue-600" />
          </div>
          
          <div className="hidden sm:flex items-center space-x-2">
            <span className="text-[10px] text-slate-400">寬度</span>
            <input type="range" min="400" max="2000" step="50" value={contentWidth} onChange={(e) => setContentWidth(parseInt(e.target.value))} className="w-20 sm:w-32 accent-gray-400" />
          </div>
        </div>
        
        <div className="w-8" /> 
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-smooth"
        onClick={(e) => {
          const y = e.clientY;
          const h = window.innerHeight;
          if (y > h * 0.7) scrollPage('next');
          else if (y < h * 0.3) scrollPage('prev');
        }}
      >
        <div 
          className="mx-auto py-10 px-6 sm:px-12 transition-all duration-300"
          style={{ 
            maxWidth: contentWidth >= 2000 ? '100%' : `${contentWidth}px`, 
            fontSize: `${fontSize}px`, 
            lineHeight: '1.8', 
            color: '#334155' 
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>

      {audioUrl && (
        <div className="h-20 bg-white border-t flex items-center justify-center px-4 z-20 shadow-inner">
          <audio controls src={getDirectAudioUrl(audioUrl)} className="w-full max-w-2xl h-8" />
        </div>
      )}
    </div>
  );
}
