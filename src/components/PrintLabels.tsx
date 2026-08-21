import { useCallback, useEffect, useRef, useState } from "react";
import {
  Printer, Plus, Trash2, Save, MapPin, Tag, Settings2,
  Type, Bold, AlignLeft, AlignCenter, AlignRight,
  Layers, TestTube, X, Check, ChevronDown, Copy,
} from "lucide-react";
import type { ProductResult } from "@/lib/supabase";
import {
  type LabelField, type LabelSize, type LabelUnit, type FieldPosition,
  LABEL_PRESETS, POSITION_PRESETS, DEFAULT_FIELDS,
  shortenTitle, getPositionStyle, toInches, formatPrice,
} from "@/lib/labelUtils";
import {
  getLabelPreferences, saveLabelPreferences,
  getSavedLocations, addSavedLocation, renameSavedLocation, deleteSavedLocation, setDefaultLocation,
  getLabelTemplates, saveLabelTemplate, renameLabelTemplate, deleteLabelTemplate, setDefaultTemplate,
  type SavedLocation, type LabelTemplate,
} from "@/lib/labelDb";

interface PrintLabelsProps {
  productResult: ProductResult | null;
  onClose?: () => void;
}

export default function PrintLabels({ productResult, onClose }: PrintLabelsProps) {
  const [fields, setFields] = useState<LabelField[]>(DEFAULT_FIELDS.map((f) => ({ ...f })));
  const [labelSize, setLabelSize] = useState<LabelSize>(LABEL_PRESETS[0]);
  const [customWidth, setCustomWidth] = useState("2.25");
  const [customHeight, setCustomHeight] = useState("1.25");
  const [customUnit, setCustomUnit] = useState<LabelUnit>("in");
  const [showCustomSize, setShowCustomSize] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [autoCreateLabel, setAutoCreateLabel] = useState(false);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [newLocationName, setNewLocationName] = useState("");
  const [showLocationManager, setShowLocationManager] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState("");
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; fieldX: number; fieldY: number } | null>(null);

  // Load preferences and templates on mount
  useEffect(() => {
    (async () => {
      const prefs = await getLabelPreferences();
      if (prefs) {
        if (prefs.default_layout?.fields) {
          setFields(prefs.default_layout.fields);
        }
        const w = Number(prefs.label_width);
        const h = Number(prefs.label_height);
        const unit = prefs.label_unit as LabelUnit;
        const preset = LABEL_PRESETS.find((p) => p.width === w && p.height === h && p.unit === unit);
        if (preset) {
          setLabelSize(preset);
        } else {
          setLabelSize({ id: "custom", name: "Custom", width: w, height: h, unit });
          setCustomWidth(String(w));
          setCustomHeight(String(h));
          setCustomUnit(unit);
          setShowCustomSize(true);
        }
        setAutoCreateLabel(prefs.auto_create_label);
        if (prefs.default_location) setDefaultLocation(prefs.default_location);
      }

      const locs = await getSavedLocations();
      setLocations(locs);
      const defLoc = locs.find((l) => l.is_default);
      if (defLoc && !defaultLocation) {
        setDefaultLocation(defLoc.name);
        updateFieldValue("location", defLoc.name);
      }

      const tmpls = await getLabelTemplates();
      setTemplates(tmpls);
      setPrefsLoaded(true);
    })();
  }, []);

  // Auto-populate from product result
  useEffect(() => {
    if (productResult && prefsLoaded) {
      const shortTitle = shortenTitle(productResult.title);
      updateFieldValue("title", shortTitle);
      if (productResult.finalPrice > 0) {
        updateFieldValue("price", formatPrice(productResult.finalPrice));
      }
      if (defaultLocation) {
        updateFieldValue("location", defaultLocation);
      }
    }
  }, [productResult, prefsLoaded]);

  // Auto-populate location when default changes
  useEffect(() => {
    if (defaultLocation && prefsLoaded) {
      updateFieldValue("location", defaultLocation);
    }
  }, [defaultLocation, prefsLoaded]);

  function updateFieldValue(id: string, value: string) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  }

  function updateField(id: string, updates: Partial<LabelField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  function addCustomField() {
    const id = `custom-${Date.now()}`;
    setFields((prev) => [...prev, {
      id, label: "Custom Text", enabled: true, value: "",
      position: "center", fontSize: 9, bold: false, autoFit: false,
    }]);
    setEditingFieldId(id);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  const currentWidth = labelSize.id === "custom" ? Number(customWidth) || 2.25 : labelSize.width;
  const currentHeight = labelSize.id === "custom" ? Number(customHeight) || 1.25 : labelSize.height;
  const currentUnit = labelSize.id === "custom" ? customUnit : labelSize.unit;
  const widthIn = toInches(currentWidth, currentUnit);
  const heightIn = toInches(currentHeight, currentUnit);

  // Preview scaling — fit within max 400px wide, 200px tall
  const maxPreviewW = 400;
  const maxPreviewH = 200;
  const scale = Math.min(maxPreviewW / widthIn, maxPreviewH / heightIn);
  const previewW = widthIn * scale;
  const previewH = heightIn * scale;

  // Drag and drop on preview
  const handlePointerDown = (e: React.PointerEvent, fieldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    setDraggingField(fieldId);
    setEditingFieldId(fieldId);

    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;

    const fieldStyle = getPositionStyle(field.position, field.customX, field.customY);
    // Get current position in percentage
    const currentX = field.customX ?? (field.position.includes("right") ? 100 : field.position.includes("center") ? 50 : 0);
    const currentY = field.customY ?? (field.position.includes("bottom") ? 100 : field.position.includes("center") ? 50 : 0);

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      fieldX: currentX,
      fieldY: currentY,
    };

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingField || !dragStartRef.current || !previewRef.current) return;

    const rect = previewRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragStartRef.current.mouseX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragStartRef.current.mouseY) / rect.height) * 100;

    let newX = dragStartRef.current.fieldX + dxPct;
    let newY = dragStartRef.current.fieldY + dyPct;
    newX = Math.max(0, Math.min(100, newX));
    newY = Math.max(0, Math.min(100, newY));

    updateField(draggingField, { customX: newX, customY: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingField) {
      setDraggingField(null);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
    dragStartRef.current = null;
  };

  // Print
  function handlePrint(testMode = false) {
    const printFields = testMode
      ? [
          { id: "test1", label: "Test", enabled: true, value: "ELITE ITEM LISTING\nTEST LABEL", position: "center" as FieldPosition, fontSize: 12, bold: true, autoFit: true },
          { id: "test2", label: "Size", enabled: true, value: `${currentWidth} × ${currentHeight}`, position: "bottom-center" as FieldPosition, fontSize: 8, bold: false, autoFit: false },
        ]
      : fields.filter((f) => f.enabled && f.value);

    const printHtml = generatePrintHtml(printFields, widthIn, heightIn, quantity);

    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) {
      alert("Please allow popups to print labels.");
      return;
    }

    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  function generatePrintHtml(printFields: LabelField[], wIn: number, hIn: number, qty: number): string {
    const fieldsHtml = printFields.map((f) => {
      const style = getPositionStyle(f.position, f.customX, f.customY);
      const styleStr = `position:absolute;left:${style.left};top:${style.top};transform:${style.transform};text-align:${style.textAlign};max-width:95%;`;
      const fontSize = f.autoFit
        ? `font-size:${f.fontSize}pt;`
        : `font-size:${f.fontSize}pt;`;
      const bold = f.bold ? "font-weight:bold;" : "";
      const lines = f.value.split("\n").map((line) =>
        `<div style="line-height:1.1;white-space:pre-wrap;overflow:hidden;">${escapeHtml(line)}</div>`
      ).join("");
      return `<div style="${styleStr}${fontSize}${bold}">${lines}</div>`;
    }).join("");

    const labels = Array.from({ length: qty }, () =>
      `<div class="label" style="width:${wIn}in;height:${hIn}in;position:relative;overflow:hidden;page-break-after:always;">${fieldsHtml}</div>`
    ).join("");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Print Label</title>
<style>
@page { size: ${wIn}in ${hIn}in; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #fff; }
.label { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
@media print {
  .label { page-break-after: always; }
  .label:last-child { page-break-after: auto; }
}
@media screen {
  body { background: #ccc; padding: 20px; }
  .label { margin-bottom: 10px; border: 1px dashed #999; }
}
</style>
</head>
<body>${labels}</body>
</html>`;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Save preferences
  async function handleSaveLayout() {
    await saveLabelPreferences({
      label_width: currentWidth,
      label_height: currentHeight,
      label_unit: currentUnit,
      auto_create_label: autoCreateLabel,
      default_location: defaultLocation,
      default_layout: { fields },
    });
  }

  async function handleSaveTemplate() {
    if (!newTemplateName.trim()) return;
    await saveLabelTemplate(newTemplateName.trim(), { fields });
    const tmpls = await getLabelTemplates();
    setTemplates(tmpls);
    setNewTemplateName("");
  }

  async function handleAddLocation() {
    if (!newLocationName.trim()) return;
    await addSavedLocation(newLocationName.trim());
    const locs = await getSavedLocations();
    setLocations(locs);
    setNewLocationName("");
  }

  async function handleSetDefaultLocation(id: string) {
    await setDefaultLocation(id);
    const locs = await getSavedLocations();
    setLocations(locs);
    const def = locs.find((l) => l.is_default);
    if (def) setDefaultLocation(def.name);
  }

  async function handleDeleteLocation(id: string) {
    await deleteSavedLocation(id);
    const locs = await getSavedLocations();
    setLocations(locs);
  }

  async function handleRenameLocation(id: string, name: string) {
    await renameSavedLocation(id, name);
    const locs = await getSavedLocations();
    setLocations(locs);
  }

  async function handleApplyTemplate(tmpl: LabelTemplate) {
    if (tmpl.layout?.fields) {
      setFields(tmpl.layout.fields);
    }
  }

  async function handleDeleteTemplate(id: string) {
    await deleteLabelTemplate(id);
    const tmpls = await getLabelTemplates();
    setTemplates(tmpls);
  }

  async function handleSetDefaultTemplate(id: string) {
    await setDefaultTemplate(id);
    const tmpls = await getLabelTemplates();
    setTemplates(tmpls);
  }

  const activeFields = fields.filter((f) => f.enabled && f.value);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <Tag className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Print Labels</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Label Item Title */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-500">
          <Type className="h-3.5 w-3.5" />
          Label Item Title
        </label>
        <textarea
          value={fields.find((f) => f.id === "title")?.value || ""}
          onChange={(e) => updateFieldValue("title", e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-800 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          placeholder="Shortened item title for the label..."
        />
        {productResult && (
          <p className="mt-1.5 text-xs text-gray-400">
            Listing title: <span className="text-gray-500">{productResult.title}</span>
          </p>
        )}
      </div>

      {/* Label Preview */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Label Preview</span>
          <span className="text-xs text-gray-400">
            {currentWidth}{currentUnit === "mm" ? "mm" : '"'} × {currentHeight}{currentUnit === "mm" ? "mm" : '"'}
          </span>
        </div>
        <div className="flex justify-center rounded-lg bg-gray-50 p-6">
          <div
            ref={previewRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="relative cursor-default border-2 border-gray-300 bg-white shadow-sm"
            style={{ width: `${previewW}px`, height: `${previewH}px` }}
          >
            {activeFields.map((field) => (
              <div
                key={field.id}
                onPointerDown={(e) => handlePointerDown(e, field.id)}
                style={getPositionStyle(field.position, field.customX, field.customY)}
                className={`cursor-move touch-none select-none px-1 ${draggingField === field.id ? "ring-2 ring-emerald-400" : ""} ${editingFieldId === field.id ? "ring-1 ring-emerald-300" : ""}`}
              >
                {field.value.split("\n").map((line, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: `${Math.max(6, field.fontSize * (scale / 72))}px`,
                      fontWeight: field.bold ? "bold" : "normal",
                      lineHeight: 1.1,
                      whiteSpace: "pre-wrap",
                      overflow: "hidden",
                    }}
                  >
                    {line || "\u00A0"}
                  </div>
                ))}
              </div>
            ))}
            {activeFields.length === 0 && (
              <div className="flex h-full items-center justify-center text-xs text-gray-300">
                Enable fields to see preview
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400">Drag text on the label to reposition</p>
      </div>

      {/* Label Size Selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-500">
          <Settings2 className="h-3.5 w-3.5" />
          Label Size
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {LABEL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => { setLabelSize(preset); setShowCustomSize(false); }}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                labelSize.id === preset.id
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {preset.name}
            </button>
          ))}
          <button
            onClick={() => { setLabelSize({ id: "custom", name: "Custom", width: 0, height: 0, unit: "in" }); setShowCustomSize(true); }}
            className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
              showCustomSize
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            Custom
          </button>
        </div>
        {showCustomSize && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Width</label>
              <input
                type="number"
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Height</label>
              <input
                type="number"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Unit</label>
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as LabelUnit)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
              >
                <option value="in">inches</option>
                <option value="mm">mm</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Location */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-500">
          <MapPin className="h-3.5 w-3.5" />
          Storage Location
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={fields.find((f) => f.id === "location")?.value || ""}
            onChange={(e) => updateFieldValue("location", e.target.value)}
            list="saved-locations"
            placeholder="e.g. Shelf A, Bin 5..."
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
          <datalist id="saved-locations">
            {locations.map((loc) => (
              <option key={loc.id} value={loc.name} />
            ))}
          </datalist>
          <button
            onClick={() => setShowLocationManager(!showLocationManager)}
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
          >
            Manage
          </button>
        </div>
        {defaultLocation && (
          <p className="mt-1.5 text-xs text-gray-400">Default: <span className="text-gray-500">{defaultLocation}</span></p>
        )}

        {/* Location Manager */}
        {showLocationManager && (
          <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="New location name..."
                className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
              />
              <button
                onClick={handleAddLocation}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="space-y-1">
              {locations.map((loc) => (
                <div key={loc.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                  <input
                    type="text"
                    defaultValue={loc.name}
                    onBlur={(e) => e.target.value !== loc.name && handleRenameLocation(loc.id, e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  {loc.is_default ? (
                    <span className="text-xs font-medium text-emerald-600">Default</span>
                  ) : (
                    <button
                      onClick={() => handleSetDefaultLocation(loc.id)}
                      className="text-xs text-gray-400 hover:text-emerald-600"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteLocation(loc.id)}
                    className="text-gray-300 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {locations.length === 0 && (
                <p className="text-xs text-gray-400">No saved locations yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Text Fields */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
            <Layers className="h-3.5 w-3.5" />
            Text Fields
          </span>
          <button
            onClick={addCustomField}
            className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
          >
            <Plus className="h-3.5 w-3.5" /> Add Custom Text
          </button>
        </div>
        <div className="space-y-2">
          {fields.map((field) => (
            <div
              key={field.id}
              className={`rounded-lg border p-2.5 transition ${
                editingFieldId === field.id
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateField(field.id, { enabled: !field.enabled })}
                  className={`flex h-5 w-5 items-center justify-center rounded transition ${
                    field.enabled
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {field.enabled && <Check className="h-3 w-3" />}
                </button>
                <span className="flex-1 text-sm font-medium text-gray-700">{field.label}</span>
                {field.id.startsWith("custom-") && (
                  <button
                    onClick={() => removeField(field.id)}
                    className="text-gray-300 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setEditingFieldId(editingFieldId === field.id ? null : field.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {field.enabled && (
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={`${field.label}...`}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
                />
              )}
              {field.enabled && editingFieldId === field.id && (
                <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5">
                  {/* Position */}
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Position</label>
                    <select
                      value={field.position}
                      onChange={(e) => updateField(field.id, { position: e.target.value as FieldPosition, customX: undefined, customY: undefined })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                    >
                      {POSITION_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Font size */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-gray-400">Font Size</label>
                      <input
                        type="range"
                        min="6"
                        max="24"
                        value={field.fontSize}
                        onChange={(e) => updateField(field.id, { fontSize: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    <span className="text-xs text-gray-500">{field.fontSize}pt</span>
                  </div>
                  {/* Bold + AutoFit */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => updateField(field.id, { bold: !field.bold })}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        field.bold
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Bold className="h-3.5 w-3.5" /> Bold
                    </button>
                    <button
                      onClick={() => updateField(field.id, { autoFit: !field.autoFit })}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        field.autoFit
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      Auto Fit
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Templates */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
            <Layers className="h-3.5 w-3.5" />
            Templates
          </span>
          <button
            onClick={() => setShowTemplateManager(!showTemplateManager)}
            className="text-xs font-medium text-gray-500 hover:text-emerald-600"
          >
            {showTemplateManager ? "Hide" : "Manage"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="flex items-center gap-1">
              <button
                onClick={() => handleApplyTemplate(tmpl)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  tmpl.is_default
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tmpl.name}
              </button>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-xs text-gray-400">No templates saved.</p>
          )}
        </div>
        {showTemplateManager && (
          <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Template name..."
                className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
              />
              <button
                onClick={handleSaveTemplate}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <Save className="h-3.5 w-3.5" /> Save Current
              </button>
            </div>
            <div className="space-y-1">
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                  <span className="flex-1 text-sm text-gray-700">{tmpl.name}</span>
                  {tmpl.is_default ? (
                    <span className="text-xs font-medium text-emerald-600">Default</span>
                  ) : (
                    <button
                      onClick={() => handleSetDefaultTemplate(tmpl.id)}
                      className="text-xs text-gray-400 hover:text-emerald-600"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="text-gray-300 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Print Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Print Options</span>
        </div>

        {/* Auto Create Label toggle */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-gray-600">Auto Create Label</span>
          <button
            onClick={() => setAutoCreateLabel(!autoCreateLabel)}
            className={`relative h-6 w-11 rounded-full transition ${
              autoCreateLabel ? "bg-emerald-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                autoCreateLabel ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Quantity */}
        <div className="mb-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-500">Quantity</label>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 5, 10].map((q) => (
              <button
                key={q}
                onClick={() => setQuantity(q)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  quantity === q
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {q}
              </button>
            ))}
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        {/* Save Layout */}
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={handleSaveLayout}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
          >
            <Save className="h-4 w-4" /> Save as Default Layout
          </button>
        </div>

        {/* Print buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handlePrint(false)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Printer className="h-5 w-5" /> Print Label
          </button>
          <button
            onClick={() => handlePrint(true)}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            <TestTube className="h-4 w-4" /> Print Test Label
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400">
          Print Scale: 100% / Actual Size &middot; Margins: None
        </p>
      </div>
    </div>
  );
}
