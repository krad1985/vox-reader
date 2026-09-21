import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  // 自動轉換一般的 Google Docs 連結為匯出格式
  if (url.includes('docs.google.com/document/d/')) {
    const docId = url.match(/\/d\/(.+?)(\/|$)/)?.[1];
    if (docId) {
      url = `https://docs.google.com/document/d/${docId}/export?format=html`;
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch content');
    
    let html = await response.text();
    
    // 如果抓到的是 Google 的導航/預覽頁面，而非純 HTML 內容
    // 雖然 export?format=html 通常很乾淨，但有時權限不足會抓到導航頁
    if (html.includes('google-drive-viewer') || html.includes('id="docs-header"')) {
       // 試圖提取最核心的內容區域
       const startMatch = html.indexOf('<body');
       const endMatch = html.lastIndexOf('</body>');
       if (startMatch !== -1 && endMatch !== -1) {
         html = html.substring(startMatch, endMatch + 7);
       }
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
