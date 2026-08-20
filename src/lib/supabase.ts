import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ProductResult {
  title: string;
  specs: string[];
  highestPrice: number;
  highestPriceSourceUrl: string;
  finalPrice: number;
  priceNote: string;
  productLinks: string[];
  confidence: string;
}

export interface SearchRecord {
  id: string;
  query: string;
  query_type: string;
  result: ProductResult | null;
  created_at: string;
}
