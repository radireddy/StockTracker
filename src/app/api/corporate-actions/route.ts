import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/corporate-actions?status=pending&portfolio_id=<id>
 * List corporate actions for the current user.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // pending, confirmed, dismissed
  const portfolioId = url.searchParams.get("portfolio_id");

  let query = supabase
    .from("corporate_actions")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (portfolioId) query = query.eq("portfolio_id", portfolioId);

  const { data, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

/**
 * PATCH /api/corporate-actions
 * Update a corporate action (confirm, dismiss, edit details).
 * Body: { id, status?, ratio_from?, ratio_to?, ex_date?, new_symbol?, new_isin?, ... }
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id)
    return NextResponse.json(
      { error: "Missing corporate action id" },
      { status: 400 }
    );

  // Only allow updating specific fields
  const allowed = [
    "status",
    "action_type",
    "ex_date",
    "ratio_from",
    "ratio_to",
    "new_symbol",
    "new_isin",
    "old_symbol",
    "parent_cost_pct",
    "notes",
  ];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  if (Object.keys(filtered).length === 0)
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("corporate_actions")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

/**
 * DELETE /api/corporate-actions?id=<id>
 * Delete a corporate action record.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id)
    return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("corporate_actions")
    .delete()
    .eq("id", id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
