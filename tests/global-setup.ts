import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.test") });

export default async function globalSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const testEmail = process.env.TEST_USER_EMAIL!;
  const testPassword = process.env.TEST_USER_PASSWORD!;

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error("Missing env vars in .env.test — check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD");
  }

  // Sign in with email+password (email provider is enabled; not exposed in app UI)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (error || !data.session) {
    throw new Error(`Test user sign-in failed: ${error?.message ?? "no session returned"}`);
  }

  const session = data.session;

  // Derive the Supabase project ref from the URL so we can name the cookie correctly
  // e.g. https://qekskgawooubcspoqykk.supabase.co → qekskgawooubcspoqykk
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  // @supabase/ssr splits cookies at 3180 chars to stay under the 4096-byte limit
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

  // Set cookies in a headless browser context and navigate to verify
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.goto("http://localhost:3000/dashboard");
  await page.waitForURL("**/dashboard", { timeout: 15_000 });

  // Save auth state for all tests to reuse
  fs.mkdirSync(".playwright", { recursive: true });
  await page.context().storageState({ path: ".playwright/auth-state.json" });

  await browser.close();
  console.log("✓ globalSetup: authenticated as", testEmail);
}
