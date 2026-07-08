"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { action, AppError } from "@/lib/action-result";
import type { ActionResult } from "@/lib/action-result";

export async function deleteAccount(): Promise<ActionResult<void>> {
  return action(async () => {
    const { user } = await getAuthUser();
    const admin = createAdminClient();

    // Delete all storage files for this user before removing the auth row.
    // Storage does not cascade on user delete, so this must be explicit.
    const { data: files, error: listError } = await admin.storage
      .from("attachments")
      .list(user.id);

    if (listError && !listError.message.includes("not found")) {
      throw new AppError(
        "Couldn't remove your uploaded files.",
        "Please try again. If the problem continues, contact support."
      );
    }

    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from("attachments")
        .remove(paths);

      if (removeError) {
        throw new AppError(
          "Couldn't remove your uploaded files.",
          "Please try again. If the problem continues, contact support."
        );
      }
    }

    // deleteUser cascades: profiles, portfolios → companies → all research children,
    // accounts, holdings, import_holdings.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      throw new AppError(
        "Couldn't delete your account.",
        "Please try again. If the problem continues, contact support."
      );
    }
  });
}
