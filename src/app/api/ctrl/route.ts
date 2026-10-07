import { NextResponse } from 'next/server';

// Bitfocus Companion 指令佇列（本機記憶體；Vercel 冷啟動會清空，屬預期行為）
const KEY = 'vox-reader';
type Act = { id: number; action: string; ts: number };
const g = globalThis as unknown as { __voxCtrl?: { seq: number; acts: Act[] } };
if (!g.__voxCtrl) g.__voxCtrl = { seq: 0, acts: [] };

function enqueue(action: string) {
  const store = g.__voxCtrl!;
  store.seq += 1;
  store.acts.push({ id: store.seq, action, ts: Date.now() });
  if (store.acts.length > 100) store.acts.splice(0, store.acts.length - 100);
  return store.seq;
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  if (sp.get('key') !== KEY) return NextResponse.json({ error: 'bad key' }, { status: 403 });

  const action = sp.get('action');
  if (action) {
    const id = enqueue(action);
    return NextResponse.json({ ok: true, id });
  }
  const since = parseInt(sp.get('since') || '0', 10);
  const acts = g.__voxCtrl!.acts.filter(a => a.id > since);
  return NextResponse.json({ acts });
}

export async function POST(request: Request) {
  let body: { key?: string; action?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  if (body.key !== KEY) return NextResponse.json({ error: 'bad key' }, { status: 403 });
  if (!body.action) return NextResponse.json({ error: 'missing action' }, { status: 400 });
  const id = enqueue(body.action);
  return NextResponse.json({ ok: true, id });
}
