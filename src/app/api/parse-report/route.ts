import { NextResponse } from "next/server";
import { parseFiles } from "@/lib/excel-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("file").concat(form.getAll("files"));

    const validFiles = files.filter((f): f is File => f instanceof File);
    if (validFiles.length === 0) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const result = await parseFiles(validFiles);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
