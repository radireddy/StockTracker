"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProjectionType } from "@/types/database";

export async function createProjectionModel(
  companyId: string,
  projectionType: ProjectionType,
  name: string,
  isDefault: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // If this will be the default, unset any existing default first
  if (isDefault) {
    await supabase
      .from("projection_models")
      .update({ is_default: false })
      .eq("company_id", companyId)
      .eq("is_default", true);
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

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
  return data;
}

export async function deleteProjectionModel(
  projectionModelId: string,
  companyId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Check if model is the default — cannot delete default
  const { data: model, error: fetchError } = await supabase
    .from("projection_models")
    .select("is_default")
    .eq("id", projectionModelId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (model?.is_default) {
    throw new Error("Cannot delete the default projection model");
  }

  const { error } = await supabase
    .from("projection_models")
    .delete()
    .eq("id", projectionModelId);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function setDefaultProjectionModel(
  companyId: string,
  projectionModelId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Unset current default
  await supabase
    .from("projection_models")
    .update({ is_default: false })
    .eq("company_id", companyId)
    .eq("is_default", true);

  // Set new default
  const { error } = await supabase
    .from("projection_models")
    .update({ is_default: true })
    .eq("id", projectionModelId);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
  revalidatePath("/");
}

export async function saveAllProjections(
  companyId: string,
  models: Array<{
    projection_model_id: string;
    financial_years: Record<string, unknown>[];
    valuation_scenarios: Record<string, unknown>[];
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  for (const model of models) {
    // Upsert financial years for this projection model
    if (model.financial_years.length > 0) {
      const fyRows = model.financial_years.map((fy) => ({
        ...fy,
        company_id: companyId,
        user_id: user.id,
        projection_model_id: model.projection_model_id,
      }));

      const { error: fyError } = await supabase
        .from("financial_years")
        .upsert(fyRows, { onConflict: "projection_model_id,year" });

      if (fyError) throw new Error(fyError.message);
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

      if (vsError) throw new Error(vsError.message);
    }
  }

  // Update investment_horizon_years from the default model's estimate count
  const { data: defaultModel } = await supabase
    .from("projection_models")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .single();

  if (defaultModel) {
    const { count } = await supabase
      .from("financial_years")
      .select("*", { count: "exact", head: true })
      .eq("projection_model_id", defaultModel.id)
      .eq("is_estimate", true);

    await supabase
      .from("companies")
      .update({ investment_horizon_years: Math.max(0, count ?? 0) })
      .eq("id", companyId);
  }

  revalidatePath(`/company/${companyId}`);
  revalidatePath("/");
}
