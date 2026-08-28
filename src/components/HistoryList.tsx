import { History, Trash2, ChevronRight } from "lucide-react";
import type { SearchRecord } from "@/lib/supabase";

interface HistoryListProps {
  records: SearchRecord[];
  onSelect: (record: SearchRecord) => void;
  onDelete: (id: string) => void;
}

export default function HistoryList({ records, onSelect, onDelete }: HistoryListProps) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <History className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-400">No searches yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => (
        <div
          key={record.id}
          className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-emerald-300 hover:shadow-sm"
        >
          <button
            onClick={() => onSelect(record)}
            className="flex flex-1 items-center gap-3 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-medium text-gray-500">
              {record.query_type === "barcode" ? "BC" : "MN"}
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
  );
}
