import { supabase } from "@/lib/supabase";
import type { LabelField, LabelPreferences } from "@/lib/labelUtils";

export interface SavedLocation {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface LabelTemplate {
  id: string;
  name: string;
  layout: { fields: LabelField[] };
  is_default: boolean;
  created_at: string;
}

export async function getLabelPreferences(): Promise<LabelPreferences | null> {
  const { data, error } = await supabase
    .from("label_preferences")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as LabelPreferences;
}

export async function saveLabelPreferences(prefs: Partial<LabelPreferences>): Promise<void> {
  const { data: existing } = await supabase
    .from("label_preferences")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("label_preferences")
      .update({ ...prefs, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("label_preferences")
      .insert({ ...prefs, updated_at: new Date().toISOString() });
  }
}

export async function getSavedLocations(): Promise<SavedLocation[]> {
  const { data, error } = await supabase
    .from("saved_locations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as SavedLocation[];
}

export async function addSavedLocation(name: string): Promise<SavedLocation | null> {
  const { data, error } = await supabase
    .from("saved_locations")
    .insert({ name })
    .select()
    .maybeSingle();

  if (error || !data) return null;
  return data as SavedLocation;
}

export async function renameSavedLocation(id: string, name: string): Promise<void> {
  await supabase
    .from("saved_locations")
    .update({ name })
    .eq("id", id);
}

export async function deleteSavedLocation(id: string): Promise<void> {
  await supabase
    .from("saved_locations")
    .delete()
    .eq("id", id);
}

export async function setDefaultLocation(id: string): Promise<void> {
  await supabase
    .from("saved_locations")
    .update({ is_default: false })
    .neq("id", id);

  await supabase
    .from("saved_locations")
    .update({ is_default: true })
    .eq("id", id);
}

export async function getLabelTemplates(): Promise<LabelTemplate[]> {
  const { data, error } = await supabase
    .from("label_templates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as LabelTemplate[];
}

export async function saveLabelTemplate(name: string, layout: { fields: LabelField[] }): Promise<LabelTemplate | null> {
  const { data, error } = await supabase
    .from("label_templates")
    .insert({ name, layout })
    .select()
    .maybeSingle();

  if (error || !data) return null;
  return data as LabelTemplate;
}

export async function renameLabelTemplate(id: string, name: string): Promise<void> {
  await supabase
    .from("label_templates")
    .update({ name })
    .eq("id", id);
}

export async function deleteLabelTemplate(id: string): Promise<void> {
  await supabase
    .from("label_templates")
    .delete()
    .eq("id", id);
}

export async function setDefaultTemplate(id: string): Promise<void> {
  await supabase
    .from("label_templates")
    .update({ is_default: false })
    .neq("id", id);

  await supabase
    .from("label_templates")
    .update({ is_default: true })
    .eq("id", id);
}
