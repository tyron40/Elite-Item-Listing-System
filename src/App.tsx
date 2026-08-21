import { useCallback, useEffect, useState } from "react";
import { Search, ScanLine, Loader2, AlertCircle, PackageSearch, History as HistoryIcon, X, RefreshCw, Camera, Tag } from "lucide-react";
import { supabase, type ProductResult, type SearchRecord } from "@/lib/supabase";
import BarcodeScanner from "@/components/BarcodeScanner";
import ProductResults from "@/components/ProductResults";
import HistoryList from "@/components/HistoryList";
import ImageCapture from "@/components/ImageCapture";
import PrintLabels from "@/components/PrintLabels";
import LabelQueue, { type QueueItem } from "@/components/LabelQueue";

type QueryType = "model" | "barcode";
type Page = "search" | "labels";

export default function App() {
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<QueryType>("model");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProductResult | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showImageCapture, setShowImageCapture] = useState(false);
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastQuery, setLastQuery] = useState<{ query: string; type: QueryType } | null>(null);
  const [page, setPage] = useState<Page>("search");
  const [labelProduct, setLabelProduct] = useState<ProductResult | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);

  const fetchHistory = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("searches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!fetchError && data) {
      setHistory(data as SearchRecord[]);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSearch = async (searchQuery: string, type: QueryType, isRefresh = false) => {
    if (!searchQuery.trim()) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    if (!isRefresh) setResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/product-lookup`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ query: searchQuery, queryType: type }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(errBody.error || "The exact product could not be verified. Try adding the brand or model number.");
        }
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const data = await response.json() as ProductResult & { error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
      setLastQuery({ query: searchQuery, type });

      // Save to history
      await supabase.from("searches").insert({
        query: searchQuery,
        query_type: type,
        result: data,
      });

      fetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleImageSearch = async (imageData: string) => {
    setShowImageCapture(false);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/product-lookup`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ image: imageData }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(errBody.error || "Could not identify the product from the photo. Try a clearer photo or use the model number search.");
        }
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const data = await response.json() as ProductResult & { error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
      setLastQuery({ query: data.title, type: "model" });

      await supabase.from("searches").insert({
        query: "[Photo] " + data.title,
        query_type: "image",
        result: data,
      });

      fetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query, queryType);
  };

  const handleRefresh = () => {
    if (lastQuery) handleSearch(lastQuery.query, lastQuery.type, true);
  };

  const handleBarcodeDetected = (code: string) => {
    setShowScanner(false);
    setQuery(code);
    setQueryType("barcode");
    handleSearch(code, "barcode");
  };

  const handleSelectHistory = (record: SearchRecord) => {
    setShowHistory(false);
    setQuery(record.query);
    setQueryType(record.query_type as QueryType);
    if (record.result) setResult(record.result);
  };

  const handleDeleteHistory = async (id: string) => {
    await supabase.from("searches").delete().eq("id", id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
  };

  const handlePrintLabel = (product: ProductResult) => {
    setLabelProduct(product);
    setPage("labels");
  };

  const handleAddToQueue = (item: QueueItem) => {
    setQueueItems((prev) => [...prev, item]);
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueueItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearQueue = () => {
    setQueueItems([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/40">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <PackageSearch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide text-gray-900">ELITE ITEM LISTING TOOL</h1>
              <p className="text-xs text-gray-500">Identify, price & list</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page === "labels" ? "search" : "labels")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                page === "labels"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">Labels</span>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
            >
              <HistoryIcon className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
              {history.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                  {history.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {page === "labels" ? (
          <div className="space-y-4">
            <PrintLabels productResult={labelProduct} onClose={() => setPage("search")} />
            <LabelQueue
              items={queueItems}
              onAdd={handleAddToQueue}
              onRemove={handleRemoveFromQueue}
              onClear={handleClearQueue}
              widthIn={2.25}
              heightIn={1.25}
            />
          </div>
        ) : (
        <>
        {/* Search card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-5 shadow-lg shadow-gray-200/50 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    queryType === "model"
                      ? "Enter model number..."
                      : "Enter or scan barcode..."
                  }
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowImageCapture(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                title="Identify by photo"
              >
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline">Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                title="Scan barcode"
              >
                <ScanLine className="h-4 w-4" />
                <span className="hidden sm:inline">Scan</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQueryType("model")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  queryType === "model"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                Model Number
              </button>
              <button
                type="button"
                onClick={() => setQueryType("barcode")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  queryType === "barcode"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                Barcode
              </button>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </button>
            </div>
          </form>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="mt-4 rounded-2xl border border-gray-200/80 bg-white/90 p-5 shadow-lg shadow-gray-200/50">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Search History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <HistoryList
              records={history}
              onSelect={handleSelectHistory}
              onDelete={handleDeleteHistory}
            />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200/80 bg-white/90 py-20 shadow-lg shadow-gray-200/50">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
            <p className="mt-4 text-sm font-medium text-gray-600">Searching the web for your product...</p>
            <p className="mt-1 text-xs text-gray-400">Live web search can take 15-30 seconds</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800">Search failed</p>
              <p className="mt-0.5 text-sm text-red-600">{error}</p>
              {error.includes("OPENAI_API_KEY") && (
                <p className="mt-2 text-xs text-red-500">
                  You need to add an OpenAI API key as an edge function secret in your Supabase project dashboard (Edge Functions → Secrets → Add secret → name: OPENAI_API_KEY).
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Product Details</h2>
            <ProductResults result={result} onRefresh={handleRefresh} refreshing={refreshing} onPrintLabel={handlePrintLabel} />
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 shadow-lg shadow-emerald-100/50">
              <PackageSearch className="h-10 w-10 text-emerald-400" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-600">
              Enter a model number, scan a barcode, or take a photo to begin
            </p>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-gray-400">
              The AI will search the web, find the exact product, and calculate your listing price automatically
            </p>
          </div>
        )}
        </>
        )}
      </main>

      {/* Barcode scanner modal */}
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Image capture modal */}
      {showImageCapture && (
        <ImageCapture
          onCapture={handleImageSearch}
          onClose={() => setShowImageCapture(false)}
        />
      )}
    </div>
  );
}
