import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inputUrl = searchParams.get('url');

  if (!inputUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  // 1. 提取 ID
  const docIdMatch = inputUrl.match(/\/d\/(.+?)(\/|$|#|\?)/);
  const docId = docIdMatch ? docIdMatch[1] : null;

  if (!docId) {
    return NextResponse.json({ error: '無法從網址中識別 Google 文件 ID' }, { status: 400 });
  }

  // 2. 定義嘗試的 URL 優先順序
  // 優先嘗試直接訪問原始網址，因為對於「知道連結的人均可檢視」且帶有複雜組件的文件，
  // Google 有時會攔截伺服器端的 export 請求，但允許讀取預覽頁面。
  const urlsToTry = [
    inputUrl, // 原始網址 (可能是 .../edit...)
    `https://docs.google.com/document/d/${docId}/pub`,
    `https://docs.google.com/document/d/${docId}/export?format=html`
  ];

  let lastStatus = 0;

  for (const fetchUrl of urlsToTry) {
    try {
      const response = await fetch(fetchUrl, {
        next: { revalidate: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (response.ok) {
        const html = await response.text();
        return new NextResponse(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      lastStatus = response.status;
    } catch (e: any) {
      console.error('Fetch error:', e.message);
    }
  }

  // 3. 如果都失敗，回傳詳細錯誤
  return NextResponse.json({ 
    error: `讀取失敗 (錯誤碼 ${lastStatus})。`,
    debug: {
      docId,
      hint: "401 代表權限不足。請確認文件已設定為『知道連結的人均可檢視』。若您在瀏覽器能看但這裡不行，通常是因為該文件尚未對外開放，Server 無法以您的私人身份讀取。"
    }
  }, { status: 500 });
}
