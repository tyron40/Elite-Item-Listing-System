import { useEffect, useState } from "react";
import { Settings, Plus, Trash2, Globe, DollarSign, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SearchSource {
  id: string;
  name: string;
  url: string;
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [priceLimit, setPriceLimit] = useState("300");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPrice, setSavingPrice] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [srcRes, setRes] = await Promise.all([
      supabase.from("search_sources").select("*").order("created_at", { ascending: true }),
      supabase.from("app_settings").select("*").eq("key", "price_limit").single(),
    ]);
    if (srcRes.data) setSources(srcRes.data as SearchSource[]);
    if (setRes.data?.value) setPriceLimit(setRes.data.value);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAddSource = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    const { data } = await supabase
      .from("search_sources")
      .insert({ name: newName.trim(), url: newUrl.trim() })
      .select()
      .single();
    if (data) setSources((prev) => [...prev, data as SearchSource]);
    setNewName("");
    setNewUrl("");
  };

  const handleDeleteSource = async (id: string) => {
    await supabase.from("search_sources").delete().eq("id", id);
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSavePrice = async () => {
    setSavingPrice(true);
    await supabase.from("app_settings").upsert({ key: "price_limit", value: priceLimit, updated_at: new Date().toISOString() });
    setSavingPrice(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-700" />
            <h2 className="text-base font-bold text-gray-900">Settings</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* Price limit */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">Price Limit</h3>
            </div>
            <p className="mb-3 text-xs text-gray-400">Items priced above this amount get reduced to 25% of the retail price. Items at or below keep full price.</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  value={priceLimit}
                  onChange={(e) => setPriceLimit(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-7 pr-3 text-sm outline-none focus:border-gray-400 focus:bg-white"
                />
              </div>
              <button
                onClick={handleSavePrice}
                disabled={savingPrice}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                {savingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>

          {/* Custom search sources */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">Additional Search Sources</h3>
            </div>
            <p className="mb-3 text-xs text-gray-400">Add custom websites that the AI will search in addition to Amazon, eBay, Best Buy, and other default retailers.</p>

            {/* Existing sources */}
            {loading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : sources.length > 0 ? (
              <div className="mb-3 space-y-2">
                {sources.map((source) => (
                  <div key={source.id} className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <Globe className="h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-700">{source.name}</p>
                      <p className="truncate text-xs text-gray-400">{source.url}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteSource(source.id)}
                      className="rounded-md p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add new source */}
            <div className="space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Site name (e.g. Mercari, OfferUp)..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Website URL (e.g. https://mercari.com)..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <button
                onClick={handleAddSource}
                disabled={!newName.trim() || !newUrl.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add Search Source
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
