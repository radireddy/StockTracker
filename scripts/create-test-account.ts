/**
 * One-time script: copies portfolio/holdings data from the source user to the
 * e2e test user, scrubbing PII in the process.
 *
 * Usage:
 *   npx tsx scripts/create-test-account.ts
 *
 * Requires .env.test with:
 *   SOURCE_USER_EMAIL, TEST_USER_EMAIL, TEST_USER_PASSWORD,
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), ".env.test") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sourceEmail = process.env.SOURCE_USER_EMAIL;
const testEmail = process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_USER_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !sourceEmail || !testEmail || !testPassword) {
  console.error("Missing required env vars. Check .env.test.");
  process.exit(1);
}

if (testPassword === "changeme-use-a-strong-password") {
  console.error("Set a real TEST_USER_PASSWORD in .env.test before running.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getUserId(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`User not found: ${email}`);
  return user.id;
}

async function clearTestUserData(testUserId: string) {
  console.log("Clearing existing test user data...");
  // Delete in reverse FK order
  const tables = [
    "holdings",
    "market_perceptions",
    "segment_valuations",
    "timeline_entries",
    "valuation_scenarios",
    "financial_years",
    "projection_models",
    "companies",
    "accounts",
    "portfolios",
  ];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("user_id", testUserId);
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
}

async function fetchAll<T extends Record<string, unknown>>(
  table: string,
  userId: string
): Promise<T[]> {
  const { data, error } = await admin.from(table).select("*").eq("user_id", userId);
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function insertBatch(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const { error } = await admin.from(table).insert(rows);
  if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

function remap(row: Record<string, unknown>, idMap: Map<string, string>, ...keys: string[]) {
  const out = { ...row };
  for (const key of keys) {
    const oldVal = row[key] as string | null;
    if (oldVal && idMap.has(oldVal)) out[key] = idMap.get(oldVal)!;
  }
  return out;
}

async function main() {
  console.log(`\nSource user: ${sourceEmail}`);
  console.log(`Test user:   ${testEmail}\n`);

  const sourceUserId = await getUserId(sourceEmail!);
  const testUserId = await getUserId(testEmail!);

  console.log(`Source UUID: ${sourceUserId}`);
  console.log(`Test UUID:   ${testUserId}\n`);

  // Set password on test user
  const { error: pwErr } = await admin.auth.admin.updateUserById(testUserId, {
    password: testPassword,
  });
  if (pwErr) throw new Error(`Failed to set password: ${pwErr.message}`);
  console.log("✓ Password set on test user\n");

  // Scrub profile
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ display_name: "Test User", avatar_url: null })
    .eq("id", testUserId);
  if (profileErr) throw new Error(`Failed to update profile: ${profileErr.message}`);
  console.log("✓ Profile scrubbed\n");

  // Clear existing data
  await clearTestUserData(testUserId);
  console.log("");

  // idMap tracks old UUID → new UUID for FK remapping
  const idMap = new Map<string, string>();

  const newId = (oldId: string): string => {
    if (!idMap.has(oldId)) idMap.set(oldId, randomUUID());
    return idMap.get(oldId)!;
  };

  console.log("Copying data...");

  // portfolios
  const portfolios = await fetchAll<Record<string, unknown>>("portfolios", sourceUserId);
  await insertBatch(
    "portfolios",
    portfolios.map((r) => ({
      ...r,
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // accounts (PII scrubbed — label and client_id are unique per account to satisfy DB constraints)
  const accounts = await fetchAll<Record<string, unknown>>("accounts", sourceUserId);
  await insertBatch(
    "accounts",
    accounts.map((r, i) => ({
      ...r,
      id: newId(r.id as string),
      user_id: testUserId,
      label: accounts.length === 1 ? "Test Demat Account" : `Test Demat Account ${i + 1}`,
      client_id: `ZT${String(i).padStart(6, "0")}`,
      pan_number: "XXXXX0000X",
      mobile: "0000000000",
    }))
  );

  // companies
  const companies = await fetchAll<Record<string, unknown>>("companies", sourceUserId);
  await insertBatch(
    "companies",
    companies.map((r) => ({
      ...remap(r, idMap, "portfolio_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // projection_models
  const projectionModels = await fetchAll<Record<string, unknown>>("projection_models", sourceUserId);
  await insertBatch(
    "projection_models",
    projectionModels.map((r) => ({
      ...remap(r, idMap, "company_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // financial_years
  const financialYears = await fetchAll<Record<string, unknown>>("financial_years", sourceUserId);
  await insertBatch(
    "financial_years",
    financialYears.map((r) => ({
      ...remap(r, idMap, "company_id", "projection_model_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // valuation_scenarios
  const valuationScenarios = await fetchAll<Record<string, unknown>>("valuation_scenarios", sourceUserId);
  await insertBatch(
    "valuation_scenarios",
    valuationScenarios.map((r) => ({
      ...remap(r, idMap, "company_id", "projection_model_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // timeline_entries
  const timelineEntries = await fetchAll<Record<string, unknown>>("timeline_entries", sourceUserId);
  await insertBatch(
    "timeline_entries",
    timelineEntries.map((r) => ({
      ...remap(r, idMap, "company_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // segment_valuations
  const segmentValuations = await fetchAll<Record<string, unknown>>("segment_valuations", sourceUserId);
  await insertBatch(
    "segment_valuations",
    segmentValuations.map((r) => ({
      ...remap(r, idMap, "company_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // market_perceptions
  const marketPerceptions = await fetchAll<Record<string, unknown>>("market_perceptions", sourceUserId);
  await insertBatch(
    "market_perceptions",
    marketPerceptions.map((r) => ({
      ...remap(r, idMap, "company_id"),
      id: newId(r.id as string),
      user_id: testUserId,
    }))
  );

  // holdings
  const holdings = await fetchAll<Record<string, unknown>>("holdings", sourceUserId);
  await insertBatch(
    "holdings",
    holdings.map((r) => ({
      ...remap(r, idMap, "portfolio_id", "account_id", "company_id"),
      id: newId(r.id as string),
      user_id: testUserId,
      import_holding_id: null, // import history not copied
    }))
  );

  console.log("\n✓ Done. Test account seeded successfully.");
  console.log(`\nNext step: fill in NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.test, then run:`);
  console.log("  npm run test:e2e\n");
}

main().catch((err) => {
  console.error("\n✗ Script failed:", err.message);
  process.exit(1);
});
