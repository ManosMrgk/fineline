import { NextResponse } from "next/server";

const SERVICE_URL =
  process.env.CATEGORIZER_BASE_URL || "http://localhost:8001";
const SERVICE_SECRET = process.env.CATEGORIZER_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const texts = body?.texts as string[] | undefined;

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "Body must include non-empty 'texts' array" },
        { status: 400 }
      );
    }

    let res: Response;
    try {
      res = await fetch(SERVICE_URL + "/categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(SERVICE_SECRET
            ? { "X-Categorizer-Secret": SERVICE_SECRET }
            : {}),
        },
        body: JSON.stringify({ texts }),
      });
    } catch (err) {
      console.error("[categorize] Could not reach Python service:", err);
      return NextResponse.json({
        categories: texts.map(() => "Other"),
        warning: "categorizer_service_unreachable_fallback_other",
      });
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("[categorize] Service responded with error:", text);
      return NextResponse.json({
        categories: texts.map(() => "Other"),
        warning: "categorizer_service_error_fallback_other",
      });
    }

    const data = await res.json();
    const categories = (data.categories as string[]) ?? texts.map(() => "Other");

    return NextResponse.json({ categories });
  } catch (err) {
    console.error("[categorize] Unexpected route error:", err);
    return NextResponse.json(
      {
        categories: [],
        error: "Failed to categorize transactions.",
      },
      { status: 500 }
    );
  }
}
