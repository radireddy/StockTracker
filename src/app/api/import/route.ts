import { createClient } from "@/lib/supabase/server";
import { parseExcel } from "@/lib/import/excel-parser";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const companies = parseExcel(buffer);

  // Ensure default portfolio
  let { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("is_default", true)
    .single();

  if (!portfolio) {
    const { data } = await supabase
      .from("portfolios")
      .insert({ user_id: user.id, name: "Imported Portfolio", is_default: true })
      .select("id")
      .single();
    portfolio = data;
  }

  let imported = 0;
  const errors: string[] = [];

  for (const c of companies) {
    try {
      const { data: company, error: compErr } = await supabase
        .from("companies")
        .insert({
          user_id: user.id,
          portfolio_id: portfolio!.id,
          name: c.name,
          symbol: c.symbol,
          market_cap: c.market_cap,
          current_price: c.current_price,
          buy_price: c.buy_price,
          star_rating: c.star_rating,
          strategy: c.strategy,
          investment_horizon_years: c.investment_horizon_years,
          expected_returns: c.expected_returns,
          thesis: c.thesis,
          highlights: c.highlights,
        })
        .select("id")
        .single();

      if (compErr) throw compErr;

      if (c.financial_years.length) {
        await supabase.from("financial_years").insert(
          c.financial_years.map((fy) => ({
            company_id: company!.id,
            user_id: user.id,
            ...fy,
          }))
        );
      }

      if (c.valuation_scenarios.length) {
        await supabase.from("valuation_scenarios").insert(
          c.valuation_scenarios.map((vs) => ({
            company_id: company!.id,
            user_id: user.id,
            ...vs,
          }))
        );
      }

      if (c.timeline_entries.length) {
        await supabase.from("timeline_entries").insert(
          c.timeline_entries.map((te) => ({
            company_id: company!.id,
            user_id: user.id,
            entry_date: new Date().toISOString().split("T")[0],
            ...te,
          }))
        );
      }

      imported++;
    } catch (err) {
      errors.push(`${c.name}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ imported, total: companies.length, errors });
}
