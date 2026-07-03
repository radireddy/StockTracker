"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProjectionType } from "@/types/database";
import { createLogger } from "@/lib/logger";
import { action, AppError, describeDbError, type ActionResult } from "@/lib/action-result";
const log = createLogger({ service: "projection-actions" });

export async function createProjectionModel(
  companyId: string,
  projectionType: ProjectionType,
  name: string,
  isDefault: boolean
): Promise<ActionResult<Record<string, unknown>>> {
  return action(async () => {
    const { supabase, user } = await getAuthUser();

    // If this will be the default, unset any existing default first
    if (isDefault) {
      const { error: unsetErr } = await supabase
        .from("projection_models")
        .update({ is_default: false })
        .eq("company_id", companyId)
        .eq("is_default", true);
      if (unsetErr) {
        log.error("createProjectionModel unset-default failed", { error: unsetErr.message, companyId });
        throw describeDbError(unsetErr, "Couldn't update the existing default model.");
      }
    }

    const { data, error } = await supabase
      .from("projection_models")
      .insert({
        company_id: companyId,
        user_id: user.id,
        projection_type: projectionType,
        name,
        is_default: isDefault,
      })
      .select()
      .single();

    if (error) {
      log.error("createProjectionModel failed", { error: error.message, companyId, projectionType });
      throw describeDbError(error, "Couldn't create the projection model.");
    }
    revalidatePath(`/company/${companyId}`);
    log.info("Projection model created", { companyId, projectionType, isDefault });
    return data as Record<string, unknown>;
  });
}

export async function deleteProjectionModel(
  projectionModelId: string,
  companyId: string
): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuthUser();

    // Check if model is the default — cannot delete default
    const { data: model, error: fetchError } = await supabase
      .from("projection_models")
      .select("is_default")
      .eq("id", projectionModelId)
      .single();

    if (fetchError) {
      log.error("deleteProjectionModel fetch failed", { error: fetchError.message, projectionModelId });
      throw describeDbError(fetchError, "Couldn't load the projection model.");
    }
    if (model?.is_default) {
      log.warn("Attempted to delete default projection model", { projectionModelId, companyId });
      throw new AppError(
        "You can't delete the default projection model.",
        "Set another model as the default first, then delete this one."
      );
    }

    const { error } = await supabase
      .from("projection_models")
      .delete()
      .eq("id", projectionModelId);

    if (error) {
      log.error("deleteProjectionModel failed", { error: error.message, projectionModelId, companyId });
      throw describeDbError(error, "Couldn't delete the projection model.");
    }
    revalidatePath(`/company/${companyId}`);
    log.info("Projection model deleted", { projectionModelId, companyId });
  });
}

export async function setDefaultProjectionModel(
  companyId: string,
  projectionModelId: string
): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuthUser();

    // Unset current default
    const { error: unsetErr } = await supabase
      .from("projection_models")
      .update({ is_default: false })
      .eq("company_id", companyId)
      .eq("is_default", true);
    if (unsetErr) {
      log.error("setDefaultProjectionModel unset failed", { error: unsetErr.message, companyId });
      throw describeDbError(unsetErr, "Couldn't change the default model.");
    }

    // Set new default
    const { error } = await supabase
      .from("projection_models")
      .update({ is_default: true })
      .eq("id", projectionModelId);

    if (error) {
      log.error("setDefaultProjectionModel failed", { error: error.message, companyId, projectionModelId });
      throw describeDbError(error, "Couldn't set the default model.");
    }
    revalidatePath(`/company/${companyId}`);
    revalidatePath("/");
    log.info("Default projection model set", { companyId, projectionModelId });
  });
}

export async function saveAllProjections(
  companyId: string,
  models: Array<{
    projection_model_id: string;
    financial_years: Record<string, unknown>[];
    valuation_scenarios: Record<string, unknown>[];
  }>
): Promise<ActionResult> {
  return action(async () => {
    const { supabase, user } = await getAuthUser();

    for (const model of models) {
      // Delete existing financial years then insert current ones
      const { error: delFyError } = await supabase
        .from("financial_years")
        .delete()
        .eq("projection_model_id", model.projection_model_id);

      if (delFyError) {
        log.error("saveAllProjections delete financial years failed", { error: delFyError.message, companyId, projectionModelId: model.projection_model_id });
        throw describeDbError(delFyError, "Couldn't save your projections.");
      }

      if (model.financial_years.length > 0) {
        const fyRows = model.financial_years.map((fy) => ({
          ...fy,
          company_id: companyId,
          user_id: user.id,
          projection_model_id: model.projection_model_id,
        }));

        const { error: fyError } = await supabase
          .from("financial_years")
          .insert(fyRows);

        if (fyError) {
          log.error("saveAllProjections financial years failed", { error: fyError.message, companyId, projectionModelId: model.projection_model_id });
          throw describeDbError(fyError, "Couldn't save the financial years.");
        }
      }

      // Upsert valuation scenarios for this projection model
      if (model.valuation_scenarios.length > 0) {
        const vsRows = model.valuation_scenarios.map((vs) => ({
          ...vs,
          company_id: companyId,
          user_id: user.id,
          projection_model_id: model.projection_model_id,
        }));

        const { error: vsError } = await supabase
          .from("valuation_scenarios")
          .upsert(vsRows, { onConflict: "projection_model_id,scenario_type" });

        if (vsError) {
          log.error("saveAllProjections valuation scenarios failed", { error: vsError.message, companyId, projectionModelId: model.projection_model_id });
          throw describeDbError(vsError, "Couldn't save the valuation scenarios.");
        }
      }
    }

    // Update investment_horizon_years from the default model's estimate count
    const { data: defaultModel, error: defaultErr } = await supabase
      .from("projection_models")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .single();

    if (defaultErr) {
      log.error("saveAllProjections default-model lookup failed", { error: defaultErr.message, companyId });
      throw describeDbError(defaultErr, "Projections were saved, but the investment horizon couldn't be updated.");
    }

    if (defaultModel) {
      const { count, error: countErr } = await supabase
        .from("financial_years")
        .select("*", { count: "exact", head: true })
        .eq("projection_model_id", defaultModel.id)
        .eq("is_estimate", true);

      if (countErr) {
        log.error("saveAllProjections estimate-count failed", { error: countErr.message, companyId });
        throw describeDbError(countErr, "Projections were saved, but the investment horizon couldn't be updated.");
      }

      const { error: horizonErr } = await supabase
        .from("companies")
        .update({ investment_horizon_years: Math.max(0, count ?? 0) })
        .eq("id", companyId);

      if (horizonErr) {
        log.error("saveAllProjections horizon update failed", { error: horizonErr.message, companyId });
        throw describeDbError(horizonErr, "Projections were saved, but the investment horizon couldn't be updated.");
      }
    }

    revalidatePath(`/company/${companyId}`);
    revalidatePath("/");
    log.info("All projections saved", { companyId, modelCount: models.length });
  });
}
