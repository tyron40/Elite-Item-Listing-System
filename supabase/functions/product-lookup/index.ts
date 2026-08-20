import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProductResult {
  title: string;
  specs: string[];
  highestPrice: number;
  highestPriceSourceUrl: string;
  finalPrice: number;
  priceNote: string;
  productLinks: string[];
  confidence: string;
}

interface PriceSource {
  retailer?: string;
  price?: number;
  url?: string;
}

interface PartialResult {
  title?: string;
  specs?: string[];
  highestPrice?: number;
  highestPriceSourceUrl?: string;
  priceSources?: PriceSource[];
  productLinks?: string[];
  confidence?: string;
}

const SYSTEM_PROMPT = "You are a product identification and pricing expert. You search the web for product information and return structured JSON data. Identify the most likely real-world product for the user's query. Broad recognizable product names (e.g. 'Xbox 360', 'PlayStation 5', 'Nintendo Switch') are valid — you do NOT need an exact model number to return a result. If the exact variant is unknown, return the product family and mark uncertain fields as null or empty. Never fabricate a model number. Always return valid JSON only, no markdown formatting or code blocks.";

function buildSearchPrompt(query: string, queryType: string): string {
  const typeLabel = queryType === "barcode" ? "barcode/UPC/EAN" : "product name or model number";
  return `You are looking up a product for this ${typeLabel}: "${query}".

Use the live web search tool to find the product. Use web search to validate factual product information — do not rely on memory alone.

IDENTIFICATION RULES:

1. RECOGNIZE PRODUCT FAMILIES: If the user enters a recognizable product name like "Xbox 360", "PlayStation 5", "Nintendo Switch", "iPhone 15 Pro", "RTX 4090", or "MacBook Air M2", identify that product successfully. You do NOT need an exact hardware revision or model number to return a result.

2. EXACT VS PARTIAL: If you can determine the exact model/variant, include it. If multiple variants exist and you cannot determine which one the user means (e.g. Xbox 360 vs Xbox 360 S vs Xbox 360 E), return the product family name (e.g. "Microsoft Xbox 360") and set confidence to "medium". Do NOT reject the search just because multiple versions exist.

3. PRODUCT LINKS: Return up to 3 product links in the "productLinks" array. Each URL should be a real page for this product (not a search results page). Use different retailers when possible (manufacturer page, Amazon, eBay, Best Buy, Walmart, B&H, Newegg). If you cannot find 3 links, return as many real ones as you can — even 1 is acceptable.

4. HIGHEST PRICE: Find the ABSOLUTE HIGHEST price that exists for this product across ALL retailers and marketplaces. Search broadly — check Amazon, eBay, Best Buy, Walmart, B&H, Newegg, manufacturer direct, and any other seller. Return the single highest price you can find, in USD. If you cannot find any reliable pricing, return 0 for highestPrice — the product can still be identified without pricing.

5. HIGHEST PRICE SOURCE URL: Include "highestPriceSourceUrl" — the direct URL of the listing where you found the highest price. If no price was found, use an empty string.

6. SPECS: Combine the product description AND specifications into a single array of bullet-point strings. Include brand, model, key specs, and 2-3 description sentences — each as its own bullet.

7. BARCODE MODE: If this is a barcode search, try to map it to a specific product. Barcode searches should be more precise, but if the barcode maps to a product family rather than a specific SKU, still return the product.

Return ONLY valid JSON in this exact shape (no markdown, no code blocks, no extra text):
{
  "title": "product name including brand",
  "specs": ["Brand: ...", "Model: ...", "spec 1", "spec 2", "description sentence 1"],
  "highestPrice": 0,
  "highestPriceSourceUrl": "direct URL of the listing with the highest price, or empty string",
  "productLinks": ["url1", "url2"],
  "confidence": "high | medium | low"
}

Only return empty title with confidence "low" if the query is genuinely meaningless or does not correspond to any real product (e.g. "xyzunknownthing12345"). A recognizable product name is always enough to return a result.`;
}

function buildPriceSearchPrompt(query: string): string {
  return `You are a pricing investigator. Your job is to use live web search and find the ABSOLUTE HIGHEST price for this product: "${query}".

Search strategy — check these sources:
1. Amazon — search for the product, check all listings including third-party sellers
2. eBay — search completed/sold listings, check "Buy It Now" prices
3. Best Buy, Walmart, B&H Photo, Newegg, manufacturer's official website
4. Any specialty retailers relevant to this product category

For each source, note the price you found. Then return the SINGLE HIGHEST price across all sources.

Return ONLY valid JSON (no markdown, no code blocks, no extra text):
{
  "highestPrice": 0,
  "highestPriceSourceUrl": "direct URL of the listing with the highest price, or empty string",
  "priceSources": [{"retailer": "name", "price": 0, "url": "link to the listing"}],
  "confidence": "high | medium | low"
}

Rules:
- The price must be in USD.
- If you cannot find any reliable pricing, return 0 for highestPrice. Do not fabricate prices.
- "highestPriceSourceUrl" should be the direct URL of the page where the highest price was found, or empty string if no price was found.`;
}

const VISION_PROMPT = `You are identifying the exact product shown in the provided image. Examine the image carefully — look for brand names, model numbers, labels, logos, and any visible text on the product or its packaging.

Identify the product and return ONLY valid JSON (no markdown, no code blocks) in this exact shape:
{
  "title": "exact product name including brand and model",
  "brand": "brand name",
  "model": "model number if visible, otherwise empty string",
  "description": "brief description of what the product is",
  "confidence": "high | medium | low"
}

Rules:
- Read ALL visible text: labels, stickers, engravings, packaging, screens.
- If you can see a model number, include it exactly as printed.
- If you cannot identify the product with reasonable confidence, return empty title and confidence "low".
- Do NOT guess or invent details. Only report what you can actually see in the image.`;

function validateResult(result: ProductResult, query?: string, queryType?: string): string | null {
  if (!result.title) {
    return "The product could not be identified. Try adding the brand or model number.";
  }

  if (!Array.isArray(result.productLinks)) result.productLinks = [];
  if (!Array.isArray(result.specs)) result.specs = [String(result.specs)];

  // Only do strict query matching for barcode searches
  if (query && queryType === "barcode") {
    const queryUpper = query.toUpperCase();
    const allText = (result.title + " " + result.specs.join(" ")).toUpperCase();
    const queryParts = queryUpper.split(/\s+/).filter((p) => p.length >= 3);
    const matchedParts = queryParts.filter((p) => allText.includes(p));
    const matchRatio = queryParts.length > 0 ? matchedParts.length / queryParts.length : 1;

    if (matchRatio < 0.3) {
      return "The barcode did not match a known product. Try searching by product name instead.";
    }
  }

  // Filter out search-result page URLs from product links
  const searchPatterns = [
    /amazon\.com\/s\?/, /amazon\.com\/gp\/search/, /ebay\.com\/sch\//,
    /ebay\.com\/itm\/\?/, /google\.com\/search/, /bing\.com\/search/,
    /walmart\.com\/search/, /bestbuy\.com\/site\/searchpage/, /search\?q=/,
  ];
  result.productLinks = result.productLinks.filter(
    (link) => !searchPatterns.some((pattern) => pattern.test(link))
  );

  // Product links are optional — don't reject if none found
  return null;
}

function computePricing(result: ProductResult): void {
  const highestPrice = Number(result.highestPrice) || 0;
  result.highestPrice = highestPrice;
  result.finalPrice = highestPrice > 300 ? Number((highestPrice * 0.25).toFixed(2)) : highestPrice;
  const hp = highestPrice.toFixed(2);
  const fp = result.finalPrice.toFixed(2);
  result.priceNote = highestPrice > 300
    ? "$" + hp + " x 25% = $" + fp
    : "$" + hp + " is at or below $300, so no reduction was applied.";
}

function extractJson(content: string): string {
  let cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Strip OpenAI Responses API citation annotations like 【1†source-url】
  cleaned = cleaned.replace(/【\d+†[^】]*】/g, "");

  // If the content has surrounding text, try to extract just the JSON object
  if (!cleaned.startsWith("{")) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  return cleaned.trim();
}

async function callOpenAIChat(openaiKey: string, model: string, messages: Array<{ role: string; content: string | unknown[] }>) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`OpenAI Chat API error (${response.status}):`, errText);
    throw new Error("Search temporarily unavailable. Please try again.");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return content;
}

async function callOpenAIResponses(
  openaiKey: string,
  model: string,
  input: Array<{ role: string; content: string }>,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search" }],
      input,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`OpenAI Responses API error (${response.status}):`, errText);
    throw new Error("Search temporarily unavailable. Please try again.");
  }

  const data = await response.json();

  // The Responses API returns output_text at the top level
  let content = data.output_text;

  // Fallback: search through the output array for message content
  if (!content && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text) {
            content = part.text;
            break;
          }
        }
      }
      if (content) break;
    }
  }

  if (!content) {
    console.error("OpenAI Responses API: no text in output. Raw:", JSON.stringify(data).slice(0, 500));
    throw new Error("Search temporarily unavailable. Please try again.");
  }
  return content;
}

function mergeResults(primary: PartialResult, priceResult: PartialResult | null): ProductResult {
  let highestPrice = Number(primary.highestPrice) || 0;
  let highestPriceSourceUrl = primary.highestPriceSourceUrl || "";

  const allLinks = new Set<string>();
  const addLink = (link: unknown): void => {
    if (typeof link === "string" && link.startsWith("http")) allLinks.add(link);
  };

  primary.productLinks?.forEach(addLink);
  priceResult?.productLinks?.forEach(addLink);

  const considerPrice = (price: unknown, url: unknown): void => {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return;
    addLink(url);
    if (numericPrice > highestPrice) {
      highestPrice = numericPrice;
      highestPriceSourceUrl = typeof url === "string" ? url : highestPriceSourceUrl;
    }
  };

  considerPrice(primary.highestPrice, primary.highestPriceSourceUrl);
  if (priceResult) {
    considerPrice(priceResult.highestPrice, priceResult.highestPriceSourceUrl);
    priceResult.priceSources?.forEach((source) => {
      considerPrice(source.price, source.url);
    });
  }

  if (highestPriceSourceUrl) addLink(highestPriceSourceUrl);

  const result: ProductResult = {
    title: primary.title || "",
    specs: primary.specs || [],
    highestPrice,
    highestPriceSourceUrl,
    finalPrice: 0,
    priceNote: "",
    productLinks: Array.from(allLinks),
    confidence: primary.confidence || "medium",
  };

  computePricing(result);
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { query, queryType, image } = body;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Add OPENAI_API_KEY as an edge function secret in Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let searchQuery = query;
    let searchType = queryType;

    if (image) {
      const visionContent = await callOpenAIChat(openaiKey, "gpt-4o", [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ]);

      let visionResult: { title: string; brand: string; model: string; description: string; confidence: string };
      try {
        visionResult = JSON.parse(extractJson(visionContent));
      } catch {
        return new Response(
          JSON.stringify({ error: "Could not analyze the photo. Try a clearer photo or use the model number search." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!visionResult.title || visionResult.confidence === "low") {
        return new Response(
          JSON.stringify({ error: "Could not identify the product from the photo. Try a clearer photo with the brand and model number visible, or use the text search." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (visionResult.model) {
        searchQuery = visionResult.model;
        searchType = "model";
      } else {
        searchQuery = (visionResult.brand ? visionResult.brand + " " : "") + visionResult.title;
        searchType = "model";
      }
    } else {
      if (!query || typeof query !== "string") {
        return new Response(
          JSON.stringify({ error: "Query or image is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const searchModel = "gpt-5.6-luna";
    const [mainContent, priceContent] = await Promise.all([
      callOpenAIResponses(openaiKey, searchModel, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildSearchPrompt(searchQuery, searchType) },
      ]),
      callOpenAIResponses(openaiKey, searchModel, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPriceSearchPrompt(searchQuery) },
      ]).catch(() => null),
    ]);

    let mainResult: PartialResult;
    try {
      mainResult = JSON.parse(extractJson(mainContent));
    } catch {
      return new Response(
        JSON.stringify({ error: "The live search returned an unreadable result. Try the model number again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let priceResult: PartialResult | null = null;
    if (priceContent) {
      try {
        priceResult = JSON.parse(extractJson(priceContent));
      } catch {
        priceResult = null;
      }
    }

    const result = mergeResults(mainResult, priceResult);

    const validationError = validateResult(result, image ? undefined : query, searchType);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search temporarily unavailable. Please try again.";
    console.error("Product lookup error:", err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
