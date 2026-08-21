import { useEffect, useRef, useState } from "react";
import {
  Printer, Plus, Trash2, Save, MapPin, Tag, Settings2,
  Bold, Layers, TestTube, X, ExternalLink,
  PanelRightClose, PanelRightOpen, Star, Search, Pencil,
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
  getLabelTemplates, saveLabelTemplate, updateLabelTemplate, deleteLabelTemplate, setDefaultTemplate,
  type SavedLocation, type LabelTemplate,
} from "@/lib/labelDb";

interface PrintLabelsProps {
  productResult: ProductResult | null;
  onClose?: () => void;
}

type DragMode = "move" | "resize-right" | "resize-corner" | null;

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
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    fieldId: string;
    startX: number;
    startY: number;
    fieldX: number;
    fieldY: number;
    fieldW: number;
    moved: boolean;
  } | null>(null);

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
      const defTmpl = tmpls.find((t) => t.is_default);
      if (defTmpl && defTmpl.layout?.fields) {
        setFields(defTmpl.layout.fields);
        setActiveTemplateId(defTmpl.id);
      }
      setPrefsLoaded(true);
    })();
  }, []);

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

  function addInlineField(x: number, y: number) {
    const id = `text-${Date.now()}`;
    setFields((prev) => [...prev, {
      id,
      label: "Text",
      enabled: true,
      value: "New Text",
      position: "center",
      fontSize: 9,
      bold: false,
      autoFit: false,
      customX: x,
      customY: y,
      width: 40,
    }]);
    setSelectedFieldId(id);
    setEditingTextId(id);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
    if (editingTextId === id) setEditingTextId(null);
  }

  const currentWidth = labelSize.id === "custom" ? Number(customWidth) || 2.25 : labelSize.width;
  const currentHeight = labelSize.id === "custom" ? Number(customHeight) || 1.25 : labelSize.height;
  const currentUnit = labelSize.id === "custom" ? customUnit : labelSize.unit;
  const widthIn = toInches(currentWidth, currentUnit);
  const heightIn = toInches(currentHeight, currentUnit);

  const maxPreviewW = 480;
  const maxPreviewH = 280;
  const scale = Math.min(maxPreviewW / widthIn, maxPreviewH / heightIn);
  const previewW = widthIn * scale;
  const previewH = heightIn * scale;

  function handleFieldPointerDown(e: React.PointerEvent, fieldId: string, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    setSelectedFieldId(fieldId);

    const currentX = field.customX ?? 50;
    const currentY = field.customY ?? 50;
    const currentW = field.width ?? 40;

    dragRef.current = {
      mode,
      fieldId,
      startX: e.clientX,
      startY: e.clientY,
      fieldX: currentX,
      fieldY: currentY,
      fieldW: currentW,
      moved: false,
    };

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePreviewPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const drag = dragRef.current;
    drag.moved = true;

    if (drag.mode === "move") {
      const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
      let newX = drag.fieldX + dxPct;
      let newY = drag.fieldY + dyPct;
      newX = Math.max(0, Math.min(100, newX));
      newY = Math.max(0, Math.min(100, newY));
      updateField(drag.fieldId, { customX: newX, customY: newY });
    } else if (drag.mode === "resize-right" || drag.mode === "resize-corner") {
      const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
      let newW = drag.fieldW + dxPct;
      newW = Math.max(15, Math.min(100, newW));
      updateField(drag.fieldId, { width: newW });
    }
  }

  function handlePreviewPointerUp(e: React.PointerEvent) {
    if (dragRef.current) {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  }

  function handlePreviewDoubleClick(e: React.MouseEvent) {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    addInlineField(x, y);
  }

  function handlePreviewClick(e: React.MouseEvent) {
    if (e.target === previewRef.current) {
      setSelectedFieldId(null);
      setEditingTextId(null);
    }
  }

  function generatePrintHtml(printFields: LabelField[], wIn: number, hIn: number, qty: number): string {
    const fieldsHtml = printFields.map((f) => {
      const style = getPositionStyle(f.position, f.customX, f.customY);
      const widthStr = f.width ? `width:${f.width}%;` : "";
      const styleStr = `position:absolute;left:${style.left};top:${style.top};transform:${style.transform};text-align:${style.textAlign};max-width:95%;${widthStr}`;
      const fontSize = `font-size:${f.fontSize}pt;`;
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
@media print { .label { page-break-after: always; } .label:last-child { page-break-after: auto; } }
@media screen { body { background: #ccc; padding: 20px; } .label { margin-bottom: 10px; border: 1px dashed #999; } }
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

  function openPrintWindow(html: string) {
    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      alert("Please allow popups to print labels.");
      return null;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    return printWindow;
  }

  function handlePrint(autoPrint: boolean, testMode = false) {
    const printFields = testMode
      ? [
          { id: "test1", label: "Test", enabled: true, value: "ELITE ITEM LISTING\nTEST LABEL", position: "center" as FieldPosition, fontSize: 12, bold: true, autoFit: true },
          { id: "test2", label: "Size", enabled: true, value: `${currentWidth} × ${currentHeight}`, position: "bottom-center" as FieldPosition, fontSize: 8, bold: false, autoFit: false },
        ]
      : fields.filter((f) => f.enabled && f.value);

    const html = generatePrintHtml(printFields, widthIn, heightIn, quantity);
    const printWindow = openPrintWindow(html);
    if (printWindow && autoPrint) {
      setTimeout(() => printWindow.print(), 250);
    }
  }

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

  async function handleUpdateTemplate(id?: string) {
    const targetId = id ?? activeTemplateId;
    if (!targetId) return;
    await updateLabelTemplate(targetId, { fields });
    const tmpls = await getLabelTemplates();
    setTemplates(tmpls);
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
      setSelectedFieldId(null);
      setEditingTextId(null);
      setActiveTemplateId(tmpl.id);
    }
  }

  async function handleDeleteTemplate(id: string) {
    await deleteLabelTemplate(id);
    const tmpls = await getLabelTemplates();
    setTemplates(tmpls);
    if (activeTemplateId === id) setActiveTemplateId(null);
  }

  async function handleSetDefaultTemplate(id: string) {
    await setDefaultTemplate(id);
    const tmpls = await getLabelTemplates();
    setTemplates(tmpls);
  }

  const activeFields = fields.filter((f) => f.enabled && f.value);
  const activeTemplateName = templates.find((t) => t.id === activeTemplateId)?.name;
  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <div className="relative space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <Tag className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Print Labels</h2>
          {activeTemplateName && (
            <span className="hidden rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 sm:inline">
              {activeTemplateName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTemplatePanel(!showTemplatePanel)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              showTemplatePanel
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {showTemplatePanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            Templates
          </button>
          {onClose && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main content + slide-out template panel */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Main column */}
        <div className="flex-1 space-y-4">
          {/* Label Preview — interactive */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Label Preview</span>
              <div className="flex items-center gap-3">
                {selectedFieldId && (
                  <button
                    onClick={() => removeField(selectedFieldId)}
                    className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
                <span className="text-xs text-gray-400">
                  {currentWidth}{currentUnit === "mm" ? "mm" : '"'} × {currentHeight}{currentUnit === "mm" ? "mm" : '"'}
                </span>
              </div>
            </div>
            <div className="flex justify-center rounded-lg bg-gray-50 p-6">
              <div
                ref={previewRef}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerLeave={handlePreviewPointerUp}
                onDoubleClick={handlePreviewDoubleClick}
                onClick={handlePreviewClick}
                className="relative cursor-crosshair border-2 border-gray-300 bg-white shadow-sm touch-none"
                style={{ width: `${previewW}px`, height: `${previewH}px` }}
              >
                {activeFields.map((field) => {
                  const isSelected = selectedFieldId === field.id;
                  const isEditing = editingTextId === field.id;
                  const style = getPositionStyle(field.position, field.customX, field.customY);
                  const widthStyle = field.width ? { width: `${field.width}%` } : {};

                  return (
                    <div
                      key={field.id}
                      onPointerDown={(e) => handleFieldPointerDown(e, field.id, "move")}
                      onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingTextId(field.id); }}
                      style={{ ...style, ...widthStyle }}
                      className={`cursor-move select-none px-1 transition ${
                        isSelected ? "ring-2 ring-emerald-400" : "ring-1 ring-transparent hover:ring-1 hover:ring-emerald-200"
                      } ${isEditing ? "ring-2 ring-blue-400" : ""}`}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={field.value}
                          onChange={(e) => updateFieldValue(field.id, e.target.value)}
                          onBlur={() => setEditingTextId(null)}
                          onPointerDown={(e) => e.stopPropagation()}
                          rows={Math.min(4, field.value.split("\n").length + 1)}
                          className="w-full resize-none border-0 bg-transparent p-0 text-gray-800 outline-none"
                          style={{
                            fontSize: `${Math.max(6, field.fontSize * (scale / 72))}px`,
                            fontWeight: field.bold ? "bold" : "normal",
                            lineHeight: 1.1,
                          }}
                        />
                      ) : (
                        field.value.split("\n").map((line, i) => (
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
                        ))
                      )}

                      {/* Right-edge resize handle */}
                      {isSelected && !isEditing && (
                        <div
                          onPointerDown={(e) => handleFieldPointerDown(e, field.id, "resize-right")}
                          className="absolute top-1/2 -right-1.5 h-8 w-2.5 cursor-ew-resize rounded-full border border-white bg-emerald-500 shadow"
                          style={{ transform: "translate(50%, -50%)" }}
                        />
                      )}

                      {/* Corner resize handle */}
                      {isSelected && !isEditing && (
                        <div
                          onPointerDown={(e) => handleFieldPointerDown(e, field.id, "resize-corner")}
                          className="absolute -right-1.5 -bottom-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-emerald-500 shadow"
                          style={{ transform: "translate(50%, 50%)" }}
                        />
                      )}

                      {/* Delete button */}
                      {isSelected && !isEditing && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                          className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                          style={{ transform: "translate(-50%, -50%)" }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {activeFields.length === 0 && (
                  <div className="pointer-events-none flex h-full items-center justify-center text-xs text-gray-300">
                    Double-click to add text
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">
              Double-click to add text &middot; Click to select &middot; Drag center to move &middot; Edge or corner to resize
            </p>
          </div>

          {/* Selected field controls */}
          {selectedFieldId && (() => {
            const field = fields.find((f) => f.id === selectedFieldId);
            if (!field) return null;
            return (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Editing text</span>
                  <button
                    onClick={() => removeField(field.id)}
                    className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Text</label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => updateFieldValue(field.id, e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
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
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-gray-400">Font Size</label>
                      <input
                        type="range" min="6" max="24"
                        value={field.fontSize}
                        onChange={(e) => updateField(field.id, { fontSize: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    <span className="text-xs text-gray-500">{field.fontSize}pt</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => updateField(field.id, { bold: !field.bold })}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        field.bold ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Bold className="h-3.5 w-3.5" /> Bold
                    </button>
                    <button
                      onClick={() => updateField(field.id, { autoFit: !field.autoFit })}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        field.autoFit ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      Auto Fit
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Label Size Selector */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-500">
              <Settings2 className="h-3.5 w-3.5" />
              Label Size
            </label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
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
                  showCustomSize ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                Custom
              </button>
            </div>
            {showCustomSize && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Width</label>
                  <input type="number" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)}
                    className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Height</label>
                  <input type="number" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)}
                    className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Unit</label>
                  <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as LabelUnit)}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400">
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
                {locations.map((loc) => (<option key={loc.id} value={loc.name} />))}
              </datalist>
              <button onClick={() => setShowLocationManager(!showLocationManager)}
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200">
                Manage
              </button>
            </div>
            {defaultLocation && (
              <p className="mt-1.5 text-xs text-gray-400">Default: <span className="text-gray-500">{defaultLocation}</span></p>
            )}
            {showLocationManager && (
              <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                <div className="flex gap-2">
                  <input type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="New location name..."
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400" />
                  <button onClick={handleAddLocation}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
                <div className="space-y-1">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                      <input type="text" defaultValue={loc.name}
                        onBlur={(e) => e.target.value !== loc.name && handleRenameLocation(loc.id, e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none" />
                      {loc.is_default ? (
                        <span className="text-xs font-medium text-emerald-600">Default</span>
                      ) : (
                        <button onClick={() => handleSetDefaultLocation(loc.id)} className="text-xs text-gray-400 hover:text-emerald-600">
                          Set Default
                        </button>
                      )}
                      <button onClick={() => handleDeleteLocation(loc.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {locations.length === 0 && <p className="text-xs text-gray-400">No saved locations yet.</p>}
                </div>
              </div>
            )}
          </div>

          {/* Print Controls */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Print Options</span>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Auto Create Label</span>
              <button onClick={() => setAutoCreateLabel(!autoCreateLabel)}
                className={`relative h-6 w-11 rounded-full transition ${autoCreateLabel ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${autoCreateLabel ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-500">Quantity</label>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 3, 5, 10].map((q) => (
                  <button key={q} onClick={() => setQuantity(q)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      quantity === q ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}>
                    {q}
                  </button>
                ))}
                <input type="number" value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button onClick={handleSaveLayout}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200">
                <Save className="h-4 w-4" /> Save as Default Layout
              </button>
              {activeTemplateId && (
                <button onClick={() => handleUpdateTemplate()}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100">
                  <Save className="h-4 w-4" /> Save to "{activeTemplateName}"
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => handlePrint(true, false)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
                <Printer className="h-5 w-5" /> Print Label
              </button>
              <button onClick={() => handlePrint(false, false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-gray-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-600">
                <ExternalLink className="h-4 w-4" /> Open in Window
              </button>
              <button onClick={() => handlePrint(true, true)}
                className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800">
                <TestTube className="h-4 w-4" /> Test Label
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">
              Print Scale: 100% / Actual Size &middot; Margins: None
            </p>
          </div>
        </div>

        {/* Slide-out template panel */}
        {showTemplatePanel && (
          <div className="w-full shrink-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:w-80">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Layers className="h-4 w-4" />
                Templates
              </span>
              <button
                onClick={() => setShowTemplatePanel(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* New template */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
                placeholder="Name this template..."
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400 focus:bg-white"
              />
              <button
                onClick={handleSaveTemplate}
                disabled={!newTemplateName.trim()}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
                title="Create new template"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-emerald-400 focus:bg-white"
              />
            </div>

            {/* Template list */}
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {filteredTemplates.length === 0 && (
                <p className="py-4 text-center text-xs text-gray-400">
                  {templates.length === 0
                    ? "No templates yet. Design your label and save it as a template."
                    : "No templates match your search."}
                </p>
              )}
              {filteredTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className={`group flex items-center gap-2 rounded-lg border p-2 transition ${
                    activeTemplateId === tmpl.id
                      ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200"
                      : tmpl.is_default
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <button
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span className="flex-1 truncate text-sm font-medium text-gray-700">{tmpl.name}</span>
                    {tmpl.is_default && (
                      <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
                    )}
                  </button>
                  {!tmpl.is_default && (
                    <button
                      onClick={() => handleSetDefaultTemplate(tmpl.id)}
                      className="text-gray-300 transition hover:text-emerald-500"
                      title="Set as default"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleUpdateTemplate(tmpl.id)}
                    className="text-gray-300 transition hover:text-emerald-500"
                    title="Save current edits to this template"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="text-gray-300 transition hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <p className="border-t border-gray-100 pt-2 text-center text-xs text-gray-400">
              Click a template to load it &middot; Pencil saves edits to it
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
