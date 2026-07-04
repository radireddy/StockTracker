import { createClient } from "@/lib/supabase/server";
import type { StorageProvider, StorageResult } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "storage", provider: "supabase" });

const BUCKET = "attachments";

export class SupabaseStorageProvider implements StorageProvider {
  name = "supabase";

  async upload(file: Buffer, path: string, contentType: string): Promise<StorageResult> {
    const supabase = await createClient();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      log.error("Upload failed", { path, contentType, error: error.message });
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    const url = this.getPublicUrl(path);
    log.info("File uploaded", { path, size: file.byteLength, contentType });
    return { path, url, size: file.byteLength };
  }

  async delete(path: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      log.error("Delete failed", { path, error: error.message });
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }

  getPublicUrl(path: string): string {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  }
}
