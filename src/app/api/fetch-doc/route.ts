import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  // 強制轉換為 /pub 格式 (Google Docs "發佈到網路" 的路徑)
  // 因為 /export 格式在某些文件或權限下會返回 404/302 導致 fetch 失敗
  let fetchUrl = url;
  if (url.includes('docs.google.com/document/d/')) {
    const docId = url.match(/\/d\/(.+?)(\/|$|#|\?)/)?.[1];
    if (docId) {
      // 嘗試使用 /pub 格式，這通常是 Vercel 環境最穩定能抓到內容的路徑
      fetchUrl = `https://docs.google.com/document/d/${docId}/pub`;
    }
  }

  try {
    const response = await fetch(fetchUrl, {
      next: { revalidate: 0 }, // 禁用快取確保拿到最新內容
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      // 如果 /pub 失敗，嘗試最後的 export 格式
      const docId = url.match(/\/d\/(.+?)(\/|$|#|\?)/)?.[1];
      const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
      const secondTry = await fetch(exportUrl);
      
      if (!secondTry.ok) {
        return NextResponse.json({ 
          error: `Google Docs returned ${response.status} for /pub and ${secondTry.status} for /export. Please ensure 'Publish to web' is enabled.` 
        }, { status: 500 });
      }
      
      const html = await secondTry.text();
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    
    const html = await response.text();
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Server Fetch Error: ${error.message}` }, { status: 500 });
  }
}
