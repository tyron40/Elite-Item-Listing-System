import { useState } from "react";
import { History, Trash2, ChevronRight, Search } from "lucide-react";
import type { SearchRecord } from "@/lib/supabase";

interface HistoryListProps {
  records: SearchRecord[];
  onSelect: (record: SearchRecord) => void;
  onDelete: (id: string) => void;
}

export default function HistoryList({ records, onSelect, onDelete }: HistoryListProps) {
  const [search, setSearch] = useState("");

  const filtered = records.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.query.toLowerCase().includes(q) ||
      (r.result?.title || "").toLowerCase().includes(q)
    );
  });

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <History className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-400">No searches yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search history..."
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-400">No results match "{search}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((record) => (
            <div
              key={record.id}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-emerald-300 hover:shadow-sm"
            >
              <button
                onClick={() => onSelect(record)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-medium text-gray-500">
                  {record.query_type === "barcode" ? "BC" : record.query_type === "image" ? "PH" : "MN"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {record.query}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {record.result?.title || "No results"} ·{" "}
                    {new Date(record.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-emerald-500" />
              </button>

              <button
                onClick={() => onDelete(record.id)}
                className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
