export type LabelUnit = "in" | "mm";

export type FieldPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface LabelField {
  id: string;
  label: string;
  enabled: boolean;
  value: string;
  position: FieldPosition;
  fontSize: number;
  bold: boolean;
  autoFit: boolean;
  customX?: number;
  customY?: number;
}

export interface LabelSize {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: LabelUnit;
}

export interface LabelPreferences {
  label_width: number;
  label_height: number;
  label_unit: string;
  font_size: number;
  default_location: string | null;
  auto_create_label: boolean;
  default_layout: { fields: LabelField[] } | null;
  default_template: string | null;
}

export const LABEL_PRESETS: LabelSize[] = [
  { id: "2.25x1.25", name: '2.25" × 1.25"', width: 2.25, height: 1.25, unit: "in" },
  { id: "2x1", name: '2" × 1"', width: 2, height: 1, unit: "in" },
  { id: "3x2", name: '3" × 2"', width: 3, height: 2, unit: "in" },
  { id: "4x2", name: '4" × 2"', width: 4, height: 2, unit: "in" },
  { id: "4x6", name: '4" × 6"', width: 4, height: 6, unit: "in" },
];

export const POSITION_PRESETS: { value: FieldPosition; label: string }[] = [
  { value: "top-left", label: "Top Left" },
  { value: "top-center", label: "Top Center" },
  { value: "top-right", label: "Top Right" },
  { value: "center-left", label: "Center Left" },
  { value: "center", label: "Center" },
  { value: "center-right", label: "Center Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-center", label: "Bottom Center" },
  { value: "bottom-right", label: "Bottom Right" },
];

export const DEFAULT_FIELDS: LabelField[] = [
  { id: "title", label: "Item Title", enabled: true, value: "", position: "top-center", fontSize: 11, bold: true, autoFit: true },
  { id: "location", label: "Location", enabled: true, value: "", position: "bottom-left", fontSize: 9, bold: false, autoFit: false },
  { id: "price", label: "Price", enabled: true, value: "", position: "bottom-right", fontSize: 9, bold: false, autoFit: false },
  { id: "sku", label: "SKU", enabled: false, value: "", position: "bottom-center", fontSize: 8, bold: false, autoFit: false },
  { id: "condition", label: "Condition", enabled: false, value: "", position: "center-left", fontSize: 8, bold: false, autoFit: false },
  { id: "category", label: "Category", enabled: false, value: "", position: "center-right", fontSize: 8, bold: false, autoFit: false },
  { id: "date", label: "Date Added", enabled: false, value: "", position: "top-right", fontSize: 7, bold: false, autoFit: false },
  { id: "barcode", label: "Barcode Text", enabled: false, value: "", position: "center", fontSize: 8, bold: false, autoFit: false },
  { id: "inventory", label: "Inventory Number", enabled: false, value: "", position: "top-left", fontSize: 8, bold: false, autoFit: false },
];

const MARKETPLACE_NOISE = [
  /\bnew\b/i, /\bused\b/i, /\bexcellent\s+condition\b/i, /\bgreat\s+condition\b/i,
  /\bgood\s+condition\b/i, /\blike\s+new\b/i, /\bmint\b/i, /\bfree\s+shipping\b/i,
  /\bfast\s+shipping\b/i, /\bauthentic\b/i, /\boem\b/i, /\brare\b/i,
  /\btested\b/i, /\bworking\b/i, /\bworks\b/i, /\bgenuine\b/i,
  /\bbrand\s+new\b/i, /\bopen\s+box\b/i, /\brefurbished\b/i,
];

export function shortenTitle(title: string): string {
  if (!title) return "";
  let cleaned = title.trim();

  for (const pattern of MARKETPLACE_NOISE) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/[,\s]+$/, "").trim();

  const parts = cleaned.split(/\s+/);

  const brands = ["Apple", "Microsoft", "Sony", "Nintendo", "Samsung", "Dell", "HP", "Lenovo", "ASUS", "Acer", "NVIDIA", "AMD", "Intel", "LG", "Google", "Amazon", "Razer", "MSI", "Canon", "Nikon", "GoPro", "Bose", "Beats", "JBL"];
  const brand = parts.find((p) => brands.some((b) => b.toLowerCase() === p.toLowerCase()));

  const modelKeywords = ["Pro", "Air", "Max", "Mini", "Ultra", "Plus", "Lite", "S", "E", "X", "Z", "Ti", "SE"];
  const modelParts = parts.filter((p) => modelKeywords.some((k) => k.toLowerCase() === p.toLowerCase()));

  const sizes = parts.filter((p) => /^\d+(\.\d+)?(-|")?(inch|in|")?$/i.test(p) || /^\d+mm$/i.test(p) || /^\d+gb$/i.test(p) || /^\d+tb$/i.test(p) || /^\d+mb$/i.test(p));
  const capacities = parts.filter((p) => /^\d+(gb|tb|mb)$/i.test(p));

  const chipMatch = cleaned.match(/\b(M\d|A\d+|Ryzen\s+\d+\s*\w*|Core\s+i\d|Snapdragon\s+\w+)\b/i);
  const chip = chipMatch ? chipMatch[1] : "";

  const productTypes = ["Laptop", "Desktop", "Monitor", "Keyboard", "Mouse", "Headphones", "Speaker", "Camera", "Phone", "Tablet", "Watch", "Console", "Controller", "GPU", "CPU", "Router", "Drive", "SSD", "HDD", "Charger", "Cable", "Adapter", "Earbuds", "Mic", "Webcam", "Printer", "Scanner"];
  const productType = parts.find((p) => productTypes.some((t) => t.toLowerCase() === p.toLowerCase()));

  const colors = ["Black", "White", "Silver", "Gray", "Grey", "Space Gray", "Gold", "Blue", "Red", "Green", "Purple", "Pink", "Orange", "Yellow", "Midnight", "Starlight"];
  const color = colors.find((c) => new RegExp(`\\b${c}\\b`, "i").test(cleaned));

  const lines: string[] = [];

  const titleParts: string[] = [];
  if (brand) titleParts.push(brand);

  const coreName = parts.filter((p) => {
    const lower = p.toLowerCase();
    return !MARKETPLACE_NOISE.some((pat) => pat.test(p)) &&
      p !== brand &&
      !capacities.includes(p) &&
      lower !== "laptop" && lower !== "desktop" && lower !== "console" && lower !== "phone" && lower !== "tablet";
  });

  const nameWithoutBrand = coreName.slice(0, 4).join(" ");
  if (nameWithoutBrand && nameWithoutBrand.toLowerCase() !== brand?.toLowerCase()) {
    titleParts.push(nameWithoutBrand);
  }

  if (chip) titleParts.push(chip);

  if (titleParts.length > 0) {
    lines.push(titleParts.join(" "));
  } else {
    lines.push(parts.slice(0, 4).join(" "));
  }

  if (capacities.length > 0) {
    lines.push(capacities.join(" / "));
  }

  if (color && lines.length < 3) {
    lines[lines.length - 1] += ` ${color}`;
  }

  return lines.filter((l) => l.trim()).join("\n").trim();
}

export function positionToCoords(position: FieldPosition): { x: number; y: number } {
  const map: Record<FieldPosition, { x: number; y: number }> = {
    "top-left": { x: 0, y: 0 },
    "top-center": { x: 50, y: 0 },
    "top-right": { x: 100, y: 0 },
    "center-left": { x: 0, y: 50 },
    "center": { x: 50, y: 50 },
    "center-right": { x: 100, y: 50 },
    "bottom-left": { x: 0, y: 100 },
    "bottom-center": { x: 50, y: 100 },
    "bottom-right": { x: 100, y: 100 },
  };
  return map[position];
}

export function getPositionStyle(
  position: FieldPosition,
  customX?: number,
  customY?: number,
): React.CSSProperties {
  const useCustom = customX !== undefined && customY !== undefined;
  const x = useCustom ? customX! : positionToCoords(position).x;
  const y = useCustom ? customY! : positionToCoords(position).y;

  const align = x < 25 ? "left" : x > 75 ? "right" : "center";
  const justify = y < 25 ? "flex-start" : y > 75 ? "flex-end" : "center";

  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(${align === "right" ? "-100%" : align === "center" ? "-50%" : "0"}, ${justify === "flex-end" ? "-100%" : justify === "center" ? "-50%" : "0"})`,
    textAlign: align as "left" | "right" | "center",
    maxWidth: "95%",
  };
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function toInches(value: number, unit: LabelUnit): number {
  return unit === "mm" ? mmToInches(value) : value;
}

export function formatPrice(price: number): string {
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
