import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inputUrl = searchParams.get('url');

  if (!inputUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  // 1. 提取 ID (支援標準 /d/ID 格式以及發佈後的 /d/e/ID 格式)
  const docIdMatch = inputUrl.match(/\/d\/(e\/)?(.+?)(\/|$|#|\?)/);
  const isPublished = !!docIdMatch?.[1];
  const docId = docIdMatch ? docIdMatch[2] : null;

  if (!docId) {
    return NextResponse.json({ error: '無法識別 Google 文件 ID' }, { status: 400 });
  }

  // 2. 定義嘗試的 URL 優先順序
  let urlsToTry = [];
  
  if (isPublished || inputUrl.includes('/pub')) {
    // 如果使用者直接提供發佈連結，優先使用
    urlsToTry = [inputUrl];
  } else {
    // 否則嘗試各種匯出路徑
    urlsToTry = [
      `https://docs.google.com/document/d/${docId}/mobilebasic`,
      `https://docs.google.com/document/d/${docId}/export?format=html`,
      `https://docs.google.com/document/d/${docId}/pub`
    ];
  }

  let lastStatus = 0;

  for (const fetchUrl of urlsToTry) {
    try {
      console.log(`Trying fetch: ${fetchUrl}`);
      const response = await fetch(fetchUrl, {
        next: { revalidate: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (response.ok) {
        const html = await response.text();
        // 檢查是否真的抓到內容，而不是一個空的或錯誤的導向頁
        if (html.length > 200) {
          return new NextResponse(html, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }
      lastStatus = response.status;
      console.log(`Fetch failed for ${fetchUrl} with status ${response.status}`);
    } catch (e: any) {
      console.error(`Fetch error for ${fetchUrl}:`, e.message);
    }
  }

  return NextResponse.json({ 
    error: `讀取失敗 (錯誤碼 ${lastStatus})。`,
    debug: {
      docId,
      hint: "Google 拒絕了連線請求。這通常是因為文件的安全權限設定攔截了自動化讀取。建議您在文件中選擇『檔案 > 分享 > 發佈到網路』，並使用產生的連結測試。"
    }
  }, { status: 500 });
}
