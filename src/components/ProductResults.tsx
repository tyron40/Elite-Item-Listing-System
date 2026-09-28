import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Package,
  ListChecks,
  Link2,
  Tag,
  TrendingUp,
  Calculator,
  DollarSign,
  BadgeCheck,
  Printer,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Search,
  MessageSquare,
} from "lucide-react";
import type { ProductResult } from "@/lib/supabase";

interface ProductResultsProps {
  result: ProductResult;
  onRefresh: () => void;
  refreshing: boolean;
  onPrintLabel: (result: ProductResult) => void;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  return { copied, copy };
}

function CopyButton({
  copiedKey,
  onCopy,
  label = "Copy",
}: {
  copiedKey: boolean;
  onCopy: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onCopy}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
        copiedKey
          ? "bg-emerald-100 text-emerald-700"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {copiedKey ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}

export default function ProductResults({
  result,
  onRefresh,
  refreshing,
  onPrintLabel,
}: ProductResultsProps) {
  const { copied, copy } = useCopy();

  const confidenceColor =
    result.confidence === "high"
      ? "bg-emerald-100 text-emerald-700"
      : result.confidence === "medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-600";

  const formatPrice = (price: number) =>
    `${price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const authenticityConfig = {
    genuine: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Genuine Product" },
    likely_genuine: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Likely Genuine" },
    uncertain: { icon: ShieldQuestion, color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200", label: "Authenticity Uncertain" },
    likely_fake: { icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50", ring: "ring-red-200", label: "Likely Fake / Counterfeit" },
    fake: { icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50", ring: "ring-red-200", label: "Fake / Counterfeit" },
  } as const;

  const authKey = (result.authenticity || "uncertain") as keyof typeof authenticityConfig;
  const auth = authenticityConfig[authKey] || authenticityConfig.uncertain;
  const AuthIcon = auth.icon;

  const searchQuery = result.title || "";
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  const chatGptUrl = `https://chat.openai.com/?q=${encodeURIComponent(searchQuery)}`;

  return (
    <div className="space-y-4">
      {/* Header row: confidence + refresh */}
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${confidenceColor}`}
        >
          {result.confidence || "unknown"} confidence
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
        >
          {refreshing ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              Refreshing...
            </>
          ) : (
            <>
              <span className="text-base leading-none">↻</span>
              Refresh Search
            </>
          )}
        </button>
      </div>

      {/* Title */}
      <div className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <Package className="h-4 w-4" />
            Product Title
          </div>
          <CopyButton
            copiedKey={copied === "title"}
            onCopy={() => copy("title", result.title)}
          />
        </div>
        <p className="text-base font-semibold text-gray-900">{result.title}</p>
      </div>

      {/* Authenticity */}
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${auth.bg} ring-1 ${auth.ring}`}>
        <AuthIcon className={`mt-0.5 h-5 w-5 shrink-0 ${auth.color}`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${auth.color}`}>{auth.label}</p>
          {result.authenticityNote && (
            <p className="mt-1 text-sm text-gray-600">{result.authenticityNote}</p>
          )}
        </div>
      </div>

      {/* Cross-reference links */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
          <Search className="h-4 w-4" />
          Cross-Reference
        </div>
        <p className="mb-3 text-xs text-gray-400">Want to verify on another platform? Click to search with the product name pre-filled:</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
          >
            <Search className="h-4 w-4 text-blue-500" />
            Search on Google
          </a>
          <a
            href={chatGptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
          >
            <MessageSquare className="h-4 w-4 text-emerald-500" />
            Ask ChatGPT
          </a>
        </div>
      </div>

      {/* Specs & Description as bullet list */}
      <div className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <ListChecks className="h-4 w-4" />
            Description & Specifications
          </div>
          <CopyButton
            copiedKey={copied === "specs"}
            onCopy={() => copy("specs", result.specs.join("\n"))}
          />
        </div>
        <ul className="space-y-1.5">
          {result.specs.map((spec, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="leading-relaxed">{spec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Price cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Highest price */}
        <div className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-md">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <TrendingUp className="h-4 w-4" />
              Highest Price Found
            </div>
            <CopyButton
              copiedKey={copied === "highestPrice"}
              onCopy={() => copy("highestPrice", formatPrice(result.highestPrice))}
            />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatPrice(result.highestPrice)}
          </p>
          {result.highestPriceSourceUrl && (
            <a
              href={result.highestPriceSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
            >
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate">Proof: {result.highestPriceSourceUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>

        {/* Final price */}
        <div className="group rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 transition hover:shadow-md">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <Calculator className="h-4 w-4" />
              Final Price (25% if &gt;$300)
            </div>
            <CopyButton
              copiedKey={copied === "finalPrice"}
              onCopy={() => copy("finalPrice", formatPrice(result.finalPrice))}
            />
          </div>
          <p className="text-2xl font-bold text-emerald-700">
            {formatPrice(result.finalPrice)}
          </p>
        </div>
      </div>

      {/* Price note */}
      {result.priceNote && (
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <span>{result.priceNote}</span>
        </div>
      )}

      {/* Product links */}
      {result.productLinks.length > 0 && (
        <div className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Link2 className="h-4 w-4" />
              Product Links
            </div>
            <CopyButton
              copiedKey={copied === "links"}
              onCopy={() => copy("links", result.productLinks.join("\n"))}
            />
          </div>
          <div className="space-y-2">
            {result.productLinks.map((link, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
              >
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{link}</span>
                </a>
                <button
                  onClick={() => copy(`link-${i}`, link)}
                  className={`shrink-0 rounded-md p-1 transition ${
                    copied === `link-${i}`
                      ? "text-emerald-600"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {copied === `link-${i}` ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Copy all */}
      <CopyAllButton result={result} formatPrice={formatPrice} />

      {/* Print Label button */}
      <button
        onClick={() => onPrintLabel(result)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 font-medium text-white transition hover:bg-gray-800"
      >
        <Printer className="h-4 w-4" />
        Print Label
      </button>
    </div>
  );
}

function CopyAllButton({
  result,
  formatPrice,
}: {
  result: ProductResult;
  formatPrice: (price: number) => string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    const text = [
      `TITLE: ${result.title}`,
      ``,
      `DESCRIPTION & SPECS:`,
      ...result.specs.map((s) => `  - ${s}`),
      ``,
      `HIGHEST PRICE: ${formatPrice(result.highestPrice)}`,
      result.highestPriceSourceUrl ? `HIGHEST PRICE SOURCE: ${result.highestPriceSourceUrl}` : "",
      `FINAL PRICE: ${formatPrice(result.finalPrice)}`,
      `PRICE NOTE: ${result.priceNote}`,
      ``,
      `PRODUCT LINKS:`,
      ...result.productLinks.map((l) => `  - ${l}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopyAll}
      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium transition ${
        copied
          ? "bg-emerald-600 text-white"
          : "bg-gray-900 text-white hover:bg-gray-800"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          All Details Copied!
        </>
      ) : (
        <>
          <Tag className="h-4 w-4" />
          Copy All Details
        </>
      )}
    </button>
  );
}
