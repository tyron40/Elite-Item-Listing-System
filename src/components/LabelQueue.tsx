import { useState } from "react";
import { Plus, Trash2, Printer, X, ListChecks } from "lucide-react";
import type { ProductResult } from "@/lib/supabase";
import type { LabelField, FieldPosition } from "@/lib/labelUtils";
import { shortenTitle, formatPrice, getPositionStyle } from "@/lib/labelUtils";

export interface QueueItem {
  id: string;
  title: string;
  price: string;
  location: string;
  productResult?: ProductResult;
}

interface LabelQueueProps {
  items: QueueItem[];
  onAdd: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  widthIn: number;
  heightIn: number;
}

export default function LabelQueue({ items, onAdd, onRemove, onClear, widthIn, heightIn }: LabelQueueProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newLocation, setNewLocation] = useState("");

  function handleAdd() {
    if (!newTitle.trim()) return;
    onAdd({
      id: `queue-${Date.now()}`,
      title: newTitle.trim(),
      price: newPrice.trim(),
      location: newLocation.trim(),
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
    });
  }

  function handlePrintAll() {
    const labelFields: LabelField[] = [];
    for (const item of items) {
      labelFields.push({
        id: `title-${item.id}`,
        label: "Item Title",
        enabled: true,
        value: item.title,
        position: "top-center" as FieldPosition,
        fontSize: 11,
        bold: true,
        autoFit: true,
      });
      if (item.location) {
        labelFields.push({
          id: `loc-${item.id}`,
          label: "Location",
          enabled: true,
          value: item.location,
          position: "bottom-left" as FieldPosition,
          fontSize: 9,
          bold: false,
          autoFit: false,
        });
      }
      if (item.price) {
        labelFields.push({
          id: `price-${item.id}`,
          label: "Price",
          enabled: true,
          value: item.price,
          position: "bottom-right" as FieldPosition,
          fontSize: 9,
          bold: false,
          autoFit: false,
        });
      }
    }

    const labelsHtml = items.map((item) => {
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

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Print All Labels</title>
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
    if (!printWindow) {
      alert("Please allow popups to print labels.");
      return;
    }
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
          <ListChecks className="h-3.5 w-3.5" />
          Label Queue ({items.length})
        </span>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Clear All
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
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-400">
                  {item.price && <span>{item.price}</span>}
                  {item.price && item.location && <span> &middot; </span>}
                  {item.location && <span>{item.location}</span>}
                </p>
              </div>
              <button
                onClick={() => onRemove(item.id)}
                className="text-gray-300 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <button
          onClick={handlePrintAll}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          <Printer className="h-4 w-4" /> Print All Labels ({items.length})
        </button>
      )}
    </div>
  );
}
