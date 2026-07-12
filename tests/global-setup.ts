import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.test") });

/** Authenticate a user and save Supabase auth cookies to a storage-state file. */
async function saveAuthState(
  supabaseUrl: string,
  supabaseAnonKey: string,
  email: string,
  password: string,
  outPath: string,
  label: string,
) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${label}: ${error?.message ?? "no session"}`);
  }

  const session = data.session;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  const CHUNK_SIZE = 3180;
  const sessionJson = JSON.stringify(session);
  const chunks: string[] = [];
  for (let i = 0; i < sessionJson.length; i += CHUNK_SIZE) {
    chunks.push(sessionJson.slice(i, i + CHUNK_SIZE));
  }

  const cookies = chunks.map((chunk, i) => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${i}`,
    value: chunk,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  }));

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.goto("http://localhost:3000/dashboard");
  await page.waitForURL("**/dashboard", { timeout: 15_000 });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await page.context().storageState({ path: outPath });
  await browser.close();

  console.log(`✓ globalSetup: authenticated as ${email} → ${outPath}`);
  return data.session.user.id;
}

export default async function globalSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const testEmail = process.env.TEST_USER_EMAIL!;
  const testPassword = process.env.TEST_USER_PASSWORD!;
  const emptyEmail = process.env.TEST_EMPTY_USER_EMAIL!;
  const emptyPassword = process.env.TEST_EMPTY_USER_PASSWORD!;

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error(
      "Missing env vars — check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD in .env.test",
    );
  }

  // ── Primary test user ──────────────────────────────────────────────────────
  await saveAuthState(
    supabaseUrl,
    supabaseAnonKey,
    testEmail,
    testPassword,
    ".playwright/auth-state.json",
    testEmail,
  );

  // ── Empty test user (onboarding / welcome-screen tests) ───────────────────
  if (!emptyEmail || !emptyPassword || !serviceRoleKey) {
    console.warn(
      "⚠  globalSetup: TEST_EMPTY_USER_EMAIL / TEST_EMPTY_USER_PASSWORD / SUPABASE_SERVICE_ROLE_KEY not set — skipping empty-user setup",
    );
    return;
  }

  // Admin client bypasses RLS — used to create the user and wipe their data
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  // Create the empty user if they don't exist yet
  const signInCheck = await anon.auth.signInWithPassword({ email: emptyEmail, password: emptyPassword });
  if (signInCheck.error) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: emptyEmail,
      password: emptyPassword,
      email_confirm: true,
    });
    if (createError) {
      throw new Error(`Failed to create empty test user: ${createError.message}`);
    }
    console.log(`✓ globalSetup: created empty test user ${emptyEmail}`);
  }

  // Get the user's ID so we can wipe their data
  const { data: signIn } = await anon.auth.signInWithPassword({ email: emptyEmail, password: emptyPassword });
  const userId = signIn?.user?.id;
  if (!userId) throw new Error("Could not resolve empty test user ID");

  // Wipe all data so the dashboard shows WelcomeScreen on every run
  await admin.from("portfolios").delete().eq("user_id", userId);
  await admin.from("accounts").delete().eq("user_id", userId);
  console.log(`✓ globalSetup: wiped data for ${emptyEmail}`);

  // Save auth state for the empty user
  await saveAuthState(
    supabaseUrl,
    supabaseAnonKey,
    emptyEmail,
    emptyPassword,
    ".playwright/empty-user-auth-state.json",
    emptyEmail,
  );

  // ── Import test user (full Zerodha import flow) ───────────────────────────
  const importEmail = process.env.TEST_IMPORT_USER_EMAIL;
  const importPassword = process.env.TEST_IMPORT_USER_PASSWORD;

  if (!importEmail || !importPassword) {
    console.warn("⚠  globalSetup: TEST_IMPORT_USER_EMAIL / TEST_IMPORT_USER_PASSWORD not set — skipping import user setup");
    return;
  }

  // Create user if they don't exist yet
  const importSignInCheck = await anon.auth.signInWithPassword({ email: importEmail, password: importPassword });
  if (importSignInCheck.error) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: importEmail,
      password: importPassword,
      email_confirm: true,
    });
    if (createErr) throw new Error(`Failed to create import test user: ${createErr.message}`);
    console.log(`✓ globalSetup: created import test user ${importEmail}`);
  }

  const { data: importSignIn } = await anon.auth.signInWithPassword({ email: importEmail, password: importPassword });
  const importUserId = importSignIn?.user?.id;
  if (!importUserId) throw new Error("Could not resolve import test user ID");

  // Wipe accounts so each run starts with no pre-existing broker accounts.
  // This ensures the import always exercises the "create new account" path.
  await admin.from("accounts").delete().eq("user_id", importUserId);
  console.log(`✓ globalSetup: wiped accounts for ${importEmail}`);

  // Ensure the user has at least one holdings portfolio (import page requires it).
  const { data: existingPortfolios } = await admin
    .from("portfolios")
    .select("id")
    .eq("user_id", importUserId)
    .eq("type", "holdings");

  if (!existingPortfolios || existingPortfolios.length === 0) {
    const { error: portfolioErr } = await admin.from("portfolios").insert({
      user_id: importUserId,
      name: "My Portfolio",
      type: "holdings",
      is_default: true,
      sort_order: 0,
    });
    if (portfolioErr) throw new Error(`Failed to create holdings portfolio for import user: ${portfolioErr.message}`);
    console.log(`✓ globalSetup: created holdings portfolio for ${importEmail}`);
  }

  await saveAuthState(
    supabaseUrl,
    supabaseAnonKey,
    importEmail,
    importPassword,
    ".playwright/import-user-auth-state.json",
    importEmail,
  );
}
