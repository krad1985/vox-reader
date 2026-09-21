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
