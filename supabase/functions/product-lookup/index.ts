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

const SYSTEM_PROMPT = "You are a strict product identification and pricing expert. You search the web for product information and return structured JSON data. You MUST verify that every piece of data (title, specs, links, price) is for the EXACT product queried — never a similar model or variant. If you cannot verify the exact product, return empty results with low confidence. Always return valid JSON only, no markdown formatting or code blocks.";

function buildSearchPrompt(query: string, queryType: string): string {
  const typeLabel = queryType === "barcode" ? "barcode/UPC/EAN" : "model number";
  return `You are looking up the exact product for this ${typeLabel}: "${query}".

Use the live web search tool to find the EXACT product. Do not rely on memory or the product links alone. This is critical — the product must be an exact match for the model number or barcode given, not a similar or related model.

STRICT RULES — you MUST follow every one:

0. EXACT MATCH: The product title, specs, links, and price must ALL be for the EXACT product matching "${query}". Do NOT substitute a similar model, a different generation, or a close variant. If you cannot find the exact product, return empty title and confidence "low".

1. PRODUCT LINKS: You MUST return exactly 3 product links in the "productLinks" array. Each URL must be a real, live page for THIS EXACT product (not a search results page, not a category page). Open and verify each URL leads to the exact product. Use different retailers when possible (e.g. manufacturer page, Amazon, eBay, Best Buy, Walmart, B&H, Newegg). Do NOT return fewer than 3 links. Do NOT return placeholder or made-up URLs.

2. HIGHEST PRICE: You MUST find the ABSOLUTE HIGHEST price that exists for THIS EXACT product across ALL retailers and marketplaces. Search broadly — check Amazon, eBay (including sold listings), Best Buy, Walmart, B&H, Newegg, manufacturer direct, and any other seller. Return the single highest price you can find, in USD. This is a strict rule: do NOT return the average price, the lowest price, or a mid-range price. Return the MAXIMUM price found anywhere. The price must be for the EXACT product — not a bundle, not an accessory, not a different variant. Do NOT return 0 if any price exists.

3. HIGHEST PRICE SOURCE URL: You MUST include "highestPriceSourceUrl" — the direct URL of the listing or page where you found the absolute highest price. This URL is critical as proof of the price source. It must be a real, live page — not a search results page.

4. SPECS: Combine the product description AND specifications into a single array of bullet-point strings. Include brand, model number (which must match "${query}"), key specs, and 2-3 description sentences — each as its own bullet.

Return ONLY valid JSON in this exact shape (no markdown, no code blocks, no extra text):
{
  "title": "exact product name",
  "specs": ["Brand: ...", "Model: ...", "spec 1", "spec 2", "description sentence 1", "description sentence 2"],
  "highestPrice": 0,
  "highestPriceSourceUrl": "direct URL of the listing with the highest price",
  "productLinks": ["url1", "url2", "url3"],
  "confidence": "high | medium | low"
}

If the exact product cannot be verified, return empty title and confidence "low" rather than inventing details.`;
}

function buildPriceSearchPrompt(query: string): string {
  return `You are a pricing investigator. Your ONLY job is to use live web search and find the ABSOLUTE HIGHEST price for this exact product: "${query}".

Search strategy — you MUST check ALL of these sources:
1. Amazon — search for the product, check all listings including third-party sellers
2. eBay — search completed/sold listings, check "Buy It Now" prices, not just auctions
3. Best Buy — check if the product is sold there
4. Walmart — check marketplace sellers too
5. B&H Photo — check photography/electronics products
6. Newegg — check computer/electronics products
7. Manufacturer's official website — check MSRP
8. Any specialty retailers relevant to this product category

For each source, note the price you found. Then return the SINGLE HIGHEST price across all sources.

Return ONLY valid JSON (no markdown, no code blocks, no extra text):
{
  "highestPrice": 0,
  "highestPriceSourceUrl": "direct URL of the listing with the highest price",
  "priceSources": [{"retailer": "name", "price": 0, "url": "link to the listing"}],
  "confidence": "high | medium | low"
}

Rules:
- The price must be in USD.
- The price must be for the EXACT product — not a bundle, accessory, or variant.
- If you find a higher price on eBay from a third-party seller, use that.
- If the manufacturer's MSRP is higher than marketplace prices, use the MSRP.
- Do NOT return 0 if any price exists. Keep searching until you find at least one real price.
- Return the MAXIMUM price found across ALL sources.
- "highestPriceSourceUrl" MUST be the direct URL of the page where the highest price was found. This is critical as proof of the price source.`;
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

function validateResult(result: ProductResult, query?: string): string | null {
  if (!result.title || !result.specs || result.specs.length === 0) {
    return "The exact product could not be verified. Try adding the brand or model number.";
  }

  if (!Array.isArray(result.productLinks)) result.productLinks = [];
  if (!Array.isArray(result.specs)) result.specs = [String(result.specs)];

  if (query) {
    const queryUpper = query.toUpperCase();
    const allText = (result.title + " " + result.specs.join(" ")).toUpperCase();
    const queryParts = queryUpper.split(/\s+/).filter((p) => p.length >= 3);
    const matchedParts = queryParts.filter((p) => allText.includes(p));
    const matchRatio = queryParts.length > 0 ? matchedParts.length / queryParts.length : 1;

    if (matchRatio < 0.5) {
      return "The AI result did not match the model number closely enough. Try adding the brand name or a more specific model number.";
    }
  }

  const searchPatterns = [
    /amazon\.com\/s\?/, /amazon\.com\/gp\/search/, /ebay\.com\/sch\//,
    /ebay\.com\/itm\/\?/, /google\.com\/search/, /bing\.com\/search/,
    /walmart\.com\/search/, /bestbuy\.com\/site\/searchpage/, /search\?q=/,
  ];
  result.productLinks = result.productLinks.filter(
    (link) => !searchPatterns.some((pattern) => pattern.test(link))
  );

  if (result.productLinks.length < 1) {
    return "Could not find valid product page links for this exact model. Try the search again or add the brand name.";
  }

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

  let content = data.output_text;
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
    throw new Error("No response from AI");
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

  addLink(highestPriceSourceUrl);

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

    const validationError = validateResult(result, image ? undefined : query);
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
