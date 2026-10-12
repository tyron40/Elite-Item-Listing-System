import { useCallback, useEffect, useState } from "react";
import { Search, ScanLine, Loader2, AlertCircle, PackageSearch, History as HistoryIcon, X, RefreshCw, Camera, Tag, BookOpen, Settings as SettingsIcon, ArrowRight, TrendingUp, Award, FileText, LogOut, Users, ChevronDown } from "lucide-react";
import { supabase, type ProductResult, type SearchRecord } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import LoginPage from "@/components/LoginPage";
import AdminUsersPage from "@/components/AdminUsersPage";
import BarcodeScanner from "@/components/BarcodeScanner";
import ProductResults from "@/components/ProductResults";
import HistoryList from "@/components/HistoryList";
import ImageCapture from "@/components/ImageCapture";
import PrintLabels from "@/components/PrintLabels";
import TrainingMaterials from "@/components/TrainingMaterials";
import SettingsPanel from "@/components/SettingsPanel";
import LabelQueue, { type QueueItem, type LabelGroup } from "@/components/LabelQueue";

type QueryType = "model" | "barcode";
type Page = "home" | "search" | "labels" | "training" | "admin";

export default function App() {
  const { user, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AuthenticatedApp isAdmin={isAdmin} userEmail={user.email || ""} onSignOut={signOut} />;
}

function AuthenticatedApp({ isAdmin, userEmail, onSignOut }: { isAdmin: boolean; userEmail: string; onSignOut: () => void }) {
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
  const [page, setPage] = useState<Page>("home");
  const [labelProduct, setLabelProduct] = useState<ProductResult | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [searchSources, setSearchSources] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [priceLimit, setPriceLimit] = useState(300);
  const [labelGroups, setLabelGroups] = useState<LabelGroup[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);

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

  const fetchSettings = useCallback(async () => {
    const [srcRes, priceRes] = await Promise.all([
      supabase.from("search_sources").select("*").order("created_at", { ascending: true }),
      supabase.from("app_settings").select("*").eq("key", "price_limit").maybeSingle(),
    ]);
    if (srcRes.data) setSearchSources(srcRes.data);
    if (priceRes.data?.value) setPriceLimit(Number(priceRes.data.value));
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchSettings();
  }, [fetchHistory, fetchSettings]);

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
        body: JSON.stringify({ query: searchQuery, queryType: type, customSites: searchSources, priceLimit }),
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
        body: JSON.stringify({ image: imageData, customSites: searchSources, priceLimit }),
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

  const handleMoveItem = (id: string, groupId: string | undefined) => {
    setQueueItems((prev) => prev.map((i) => (i.id === id ? { ...i, groupId } : i)));
  };

  const handleAddGroup = (name: string) => {
    setLabelGroups((prev) => [...prev, { id: `group-${Date.now()}`, name }]);
  };

  const handleRenameGroup = (id: string, name: string) => {
    setLabelGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  };

  const handleDeleteGroup = (id: string) => {
    setLabelGroups((prev) => prev.filter((g) => g.id !== id));
    setQueueItems((prev) => prev.map((i) => (i.groupId === id ? { ...i, groupId: undefined } : i)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/40">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
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
            {isAdmin && (
              <button
                onClick={() => setPage(page === "admin" ? "home" : "admin")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  page === "admin"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Users</span>
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={() => setPage(page === "labels" ? "home" : "labels")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                page === "labels"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Tag className="h-4 w-4" />
              <span>Labels</span>
            </button>
            <button
              onClick={() => setPage(page === "training" ? "home" : "training")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                page === "training"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Training</span>
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

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                {isAdmin && <span className="text-xs text-emerald-600 font-bold">ADMIN</span>}
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-xl">
                    <div className="px-4 py-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{userEmail}</p>
                      <p className="text-xs text-gray-400">{isAdmin ? "Administrator" : "Standard user"}</p>
                    </div>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => { setShowUserMenu(false); onSignOut(); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {page === "home" ? (
          <HomePage
            historyCount={history.length}
            onNavigate={setPage}
            onOpenHistory={() => { setPage("search"); setShowHistory(true); }}
          />
        ) : page === "admin" ? (
          isAdmin ? <AdminUsersPage onClose={() => setPage("home")} /> : <HomePage historyCount={history.length} onNavigate={setPage} onOpenHistory={() => { setPage("search"); setShowHistory(true); }} />
        ) : page === "labels" ? (
          <div className="space-y-4">
            <PrintLabels productResult={labelProduct} onClose={() => setPage("home")} />
            <LabelQueue
              items={queueItems}
              onAdd={handleAddToQueue}
              onRemove={handleRemoveFromQueue}
              onClear={handleClearQueue}
              onMoveItem={handleMoveItem}
              widthIn={2.25}
              heightIn={1.25}
              groups={labelGroups}
              onAddGroup={handleAddGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          </div>
        ) : page === "training" ? (
          <TrainingMaterials isAdmin={isAdmin} />
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
                <span>Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                title="Scan barcode"
              >
                <ScanLine className="h-4 w-4" />
                <span>Scan</span>
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
                  {"You need to add an OpenAI API key as an edge function secret in your Supabase project dashboard (Edge Functions > Secrets > Add secret > name: OPENAI_API_KEY)."}
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
              Enter a model number, type detailed info, scan a barcode, or take a photo to begin
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

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel onClose={() => { setShowSettings(false); fetchSettings(); }} />
      )}
    </div>
  );
}

function HomePage({
  historyCount, onNavigate, onOpenHistory,
}: {
  historyCount: number;
  onNavigate: (page: Page) => void;
  onOpenHistory: () => void;
}) {
  const [stats, setStats] = useState({ courses: 0, materials: 0, bestScore: null as number | null });

  useEffect(() => {
    (async () => {
      const [matRes, courseRes, attemptRes] = await Promise.all([
        supabase.from("training_materials").select("id", { count: "exact", head: true }),
        supabase.from("training_courses").select("id", { count: "exact", head: true }),
        supabase.from("quiz_attempts").select("score").order("score", { ascending: false }).limit(1),
      ]);
      setStats({
        materials: matRes.count || 0,
        courses: courseRes.count || 0,
        bestScore: attemptRes.data && attemptRes.data.length > 0 ? (attemptRes.data[0] as { score: number }).score : null,
      });
    })();
  }, []);

  const features = [
    {
      title: "Product Search",
      desc: "Identify, price, and list items using model numbers, barcodes, or photos",
      icon: PackageSearch,
      gradient: "from-emerald-500 to-teal-600",
      onClick: () => onNavigate("search"),
    },
    {
      title: "Labels & Printing",
      desc: "Design and print custom price labels with templates and groups",
      icon: Tag,
      gradient: "from-blue-500 to-cyan-600",
      onClick: () => onNavigate("labels"),
    },
    {
      title: "Training & Courses",
      desc: "Upload materials, build courses, and take quizzes with pass/fail scoring",
      icon: BookOpen,
      gradient: "from-amber-500 to-orange-600",
      onClick: () => onNavigate("training"),
    },
  ];

  const statCards = [
    { label: "Searches", value: historyCount, icon: TrendingUp, color: "text-emerald-600" },
    { label: "Training Materials", value: stats.materials, icon: FileText, color: "text-blue-600" },
    { label: "Courses", value: stats.courses, icon: BookOpen, color: "text-amber-600" },
    { label: "Best Quiz Score", value: stats.bestScore !== null ? `${stats.bestScore}%` : "--", icon: Award, color: "text-orange-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 p-8 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <PackageSearch className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Welcome back</h1>
            <p className="mt-0.5 text-sm text-gray-300">Identify, price, and list your products with AI-powered tools</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-gray-200/80 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <button
              key={feature.title}
              onClick={feature.onClick}
              className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white/90 p-6 text-left shadow-lg shadow-gray-200/40 transition hover:shadow-xl hover:-translate-y-0.5"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-4 text-base font-bold text-gray-900">{feature.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">{feature.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-emerald-600 opacity-0 transition group-hover:opacity-100">
                Open <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-lg shadow-gray-200/40">
        <h3 className="text-sm font-bold text-gray-900">Quick Actions</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate("search")}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <Search className="h-4 w-4" /> Search a Product
          </button>
          <button
            onClick={() => onNavigate("labels")}
            className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Tag className="h-4 w-4" /> Print Labels
          </button>
          <button
            onClick={() => onNavigate("training")}
            className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <BookOpen className="h-4 w-4" /> View Training
          </button>
          {historyCount > 0 && (
            <button
              onClick={onOpenHistory}
              className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <HistoryIcon className="h-4 w-4" /> Search History ({historyCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
