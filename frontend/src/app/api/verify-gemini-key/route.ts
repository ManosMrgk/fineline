import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { apiKey } = await req.json().catch(() => ({}));

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid apiKey.' },
      { status: 400 }
    );
  }

  try {
    // Simple verification: call Gemini models endpoint
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      }
    );

    if (!res.ok) {
      let msg = 'Gemini rejected the API key.';
      try {
        const body = await res.json();
        if (body?.error?.message) {
          msg = body.error.message;
        }
      } catch {
        // ignore
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Network error while verifying the key.' },
      { status: 500 }
    );
  }
}
