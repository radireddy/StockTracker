import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storageRegistry } from "@/lib/providers/storage/registry";
import { isAllowedType, getMaxSize } from "@/lib/providers/storage/types";

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!companyId) {
    return NextResponse.json({ error: "No companyId provided" }, { status: 400 });
  }

  // 3. Validate file type
  const contentType = file.type;
  if (!isAllowedType(contentType)) {
    return NextResponse.json(
      { error: `File type "${contentType}" not allowed. Allowed: JPEG, PNG, WebP, GIF, PDF` },
      { status: 400 }
    );
  }

  // 4. Validate file size
  const maxSize = getMaxSize(contentType);
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return NextResponse.json(
      { error: `File too large. Maximum size: ${maxMB}MB` },
      { status: 400 }
    );
  }

  // 5. Generate storage path
  const uuid = crypto.randomUUID();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${companyId}/${uuid}-${sanitizedName}`;

  // 6. Upload via provider
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = storageRegistry.getActive();
    const result = await provider.upload(buffer, path, contentType);

    return NextResponse.json({
      url: result.url,
      path: result.path,
      filename: file.name,
      contentType,
      size: result.size,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
