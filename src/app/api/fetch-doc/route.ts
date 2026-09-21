import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

    // 強制轉換為 export?format=html 格式，這是最純粹的 HTML 匯出路徑
    let exportUrl = url;
    if (url.includes('docs.google.com/document/d/')) {
      const docId = url.match(/\/d\/(.+?)(\/|$|#|\?)/)?.[1];
      if (docId) {
        exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
      }
    }

    console.log('Fetching from:', exportUrl);
    const response = await fetch(exportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      // 嘗試第二次：如果 export 失敗，嘗試抓取基本發佈頁面
      const fallbackResponse = await fetch(url);
      const html = await fallbackResponse.text();
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
