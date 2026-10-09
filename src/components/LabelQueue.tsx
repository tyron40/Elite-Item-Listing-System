import { useState } from "react";
import { Plus, Trash2, Printer, X, ListChecks, FolderPlus, Folder, Edit3, Check } from "lucide-react";
import type { ProductResult } from "@/lib/supabase";
import type { LabelField, FieldPosition } from "@/lib/labelUtils";
import { shortenTitle, formatPrice, getPositionStyle } from "@/lib/labelUtils";

export interface QueueItem {
  id: string;
  title: string;
  price: string;
  location: string;
  productResult?: ProductResult;
  groupId?: string;
}

export interface LabelGroup {
  id: string;
  name: string;
}

interface LabelQueueProps {
  items: QueueItem[];
  onAdd: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onMoveItem: (id: string, groupId: string | undefined) => void;
  widthIn: number;
  heightIn: number;
  groups: LabelGroup[];
  onAddGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
}

export default function LabelQueue({
  items, onAdd, onRemove, onClear, onMoveItem, widthIn, heightIn,
  groups, onAddGroup, onRenameGroup, onDeleteGroup,
}: LabelQueueProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newGroupId, setNewGroupId] = useState<string | undefined>(undefined);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null); // null = All
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);

  function handleAdd() {
    if (!newTitle.trim()) return;
    onAdd({
      id: `queue-${Date.now()}`,
      title: newTitle.trim(),
      price: newPrice.trim(),
      location: newLocation.trim(),
      groupId: newGroupId,
    });
    setNewTitle("");
    setNewPrice("");
    setNewLocation("");
  }

  function handleAddFromProduct(product: ProductResult) {
    onAdd({
      id: `queue-${Date.now()}`,
      title: shortenTitle(product.title),
      price: product.finalPrice > 0 ? formatPrice(product.finalPrice) : "",
      location: "",
      productResult: product,
      groupId: activeGroupId === null ? undefined : activeGroupId || undefined,
    });
  }

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    onAddGroup(newGroupName.trim());
    setNewGroupName("");
    setShowGroupInput(false);
  }

  function handleRenameGroup(id: string) {
    if (!editingGroupName.trim()) return;
    onRenameGroup(id, editingGroupName.trim());
    setEditingGroupId(null);
    setEditingGroupName("");
  }

  const visibleItems = activeGroupId === null
    ? items
    : items.filter((i) => i.groupId === activeGroupId);

  const groupCount = (gid: string | null) =>
    gid === null ? items.length : items.filter((i) => i.groupId === gid).length;

  function handlePrintAll() {
    const labelsToPrint = activeGroupId === null ? items : items.filter((i) => i.groupId === activeGroupId);
    if (labelsToPrint.length === 0) return;

    const labelsHtml = labelsToPrint.map((item) => {
      const fields: LabelField[] = [
        { id: "title", label: "Title", enabled: true, value: item.title, position: "top-center", fontSize: 11, bold: true, autoFit: true },
      ];
      if (item.location) fields.push({ id: "location", label: "Location", enabled: true, value: item.location, position: "bottom-left", fontSize: 9, bold: false, autoFit: false });
      if (item.price) fields.push({ id: "price", label: "Price", enabled: true, value: item.price, position: "bottom-right", fontSize: 9, bold: false, autoFit: false });

      const fieldsHtml = fields.map((f) => {
        const style = getPositionStyle(f.position);
        const lines = f.value.split("\n").map((line) =>
          `<div style="line-height:1.1;white-space:pre-wrap;overflow:hidden;">${escapeHtml(line)}</div>`
        ).join("");
        return `<div style="position:absolute;left:${style.left};top:${style.top};transform:${style.transform};text-align:${style.textAlign};max-width:95%;font-size:${f.fontSize}pt;${f.bold ? "font-weight:bold;" : ""}">${lines}</div>`;
      }).join("");

      return `<div class="label" style="width:${widthIn}in;height:${heightIn}in;position:relative;overflow:hidden;page-break-after:always;">${fieldsHtml}</div>`;
    }).join("");

    const groupName = activeGroupId ? groups.find((g) => g.id === activeGroupId)?.name : "All";
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Print Labels - ${groupName}</title>
<style>
@page { size: ${widthIn}in ${heightIn}in; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #fff; }
.label { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
@media print { .label { page-break-after: always; } .label:last-child { page-break-after: auto; } }
@media screen { body { background: #ccc; padding: 20px; } .label { margin-bottom: 10px; border: 1px dashed #999; } }
</style>
</head>
<body>${labelsHtml}</body>
</html>`;

    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) { alert("Please allow popups to print labels."); return; }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  const activeGroupName = activeGroupId ? groups.find((g) => g.id === activeGroupId)?.name || "Group" : "All Labels";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
          <ListChecks className="h-3.5 w-3.5" />
          Label Queue ({items.length})
        </span>
        {items.length > 0 && (
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-500">Clear All</button>
        )}
      </div>

      {/* Group tabs */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto border-b border-gray-200 pb-2">
        <button
          onClick={() => { setActiveGroupId(null); setNewGroupId(undefined); }}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            activeGroupId === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          All
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeGroupId === null ? "bg-white/20" : "bg-gray-200"}`}>{groupCount(null)}</span>
        </button>

        {groups.map((group) => (
          <div key={group.id} className="group flex shrink-0 items-center">
            {editingGroupId === group.id ? (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
                <input
                  autoFocus
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameGroup(group.id);
                    if (e.key === "Escape") { setEditingGroupId(null); setEditingGroupName(""); }
                  }}
                  className="w-24 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-gray-400"
                />
                <button onClick={() => handleRenameGroup(group.id)} className="p-0.5 text-gray-600 hover:text-gray-900"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => { setEditingGroupId(null); setEditingGroupName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  onClick={() => { setActiveGroupId(group.id); setNewGroupId(group.id); }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeGroupId === group.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  {group.name}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeGroupId === group.id ? "bg-white/20" : "bg-gray-200"}`}>{groupCount(group.id)}</span>
                </button>
                <button
                  onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}
                  className="ml-0.5 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-gray-700 group-hover:opacity-100"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDeleteGroup(group.id)}
                  className="rounded p-0.5 text-gray-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}

        {showGroupInput ? (
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); if (e.key === "Escape") { setShowGroupInput(false); setNewGroupName(""); } }}
              placeholder="Group name..."
              className="w-28 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-gray-400"
            />
            <button onClick={handleAddGroup} className="p-0.5 text-gray-600 hover:text-gray-900"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setShowGroupInput(false); setNewGroupName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button
            onClick={() => setShowGroupInput(true)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:text-gray-700"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New Group
          </button>
        )}
      </div>

      {/* Add new item */}
      <div className="mb-3 space-y-2 rounded-lg bg-gray-50 p-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Item title..."
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Price..."
            className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
          />
          <input
            type="text"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Location..."
            className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
          />
          {groups.length > 0 && (
            <select
              value={newGroupId || ""}
              onChange={(e) => setNewGroupId(e.target.value || undefined)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none"
            >
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Queue items */}
      {visibleItems.length > 0 ? (
        <div className="space-y-1.5">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-400">
                  {item.price && <span>{item.price}</span>}
                  {item.price && item.location && <span> · </span>}
                  {item.location && <span>{item.location}</span>}
                  {item.groupId && (
                    <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {groups.find((g) => g.id === item.groupId)?.name || "Group"}
                    </span>
                  )}
                </p>
              </div>
              {/* Move menu */}
              <div className="relative">
                <button
                  onClick={() => setMoveMenuId(moveMenuId === item.id ? null : item.id)}
                  className="rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                >
                  Move
                </button>
                {moveMenuId === item.id && (
                  <div className="absolute right-0 top-8 z-10 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={() => { onMoveItem(item.id, undefined); setMoveMenuId(null); }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50"
                    >
                      No group
                    </button>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => { onMoveItem(item.id, g.id); setMoveMenuId(null); }}
                        className="block w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-400">No labels in {activeGroupName}</p>
        </div>
      )}

      {visibleItems.length > 0 && (
        <button
          onClick={handlePrintAll}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          <Printer className="h-4 w-4" /> Print {activeGroupName} ({visibleItems.length})
        </button>
      )}
    </div>
  );
}
