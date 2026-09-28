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
  authenticity: string;
  authenticityNote: string;
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
  authenticity?: string;
  authenticityNote?: string;
  amazonUrl?: string;
}

const SYSTEM_PROMPT = "You are a product identification, pricing, and authenticity expert. You search the web for product information and return structured JSON data. Identify the most likely real-world product for the user's query. Broad recognizable product names (e.g. 'Xbox 360', 'PlayStation 5', 'Nintendo Switch') are valid — you do NOT need an exact model number to return a result. If the exact variant is unknown, return the product family and mark uncertain fields as null or empty. Never fabricate a model number. Always return valid JSON only, no markdown formatting or code blocks.";

function buildSearchPrompt(query: string, queryType: string): string {
  const typeLabel = queryType === "barcode" ? "barcode/UPC/EAN" : "product name or model number";
  return `You are looking up a product for this ${typeLabel}: "${query}".

Use the live web search tool to find the product AND its pricing. Use web search to validate factual product information — do not rely on memory alone. Perform multiple searches if needed to cross-reference.

IDENTIFICATION RULES:

1. EXACT PRODUCT MATCHING: Identify the EXACT product, not a similar one. Cross-reference the query against multiple sources to confirm the precise model, variant, and brand. If the query contains a model number, match it exactly — do not return a "close" or "similar" product. Only return "medium" confidence if the product family is clear but the exact variant is ambiguous. Return "high" confidence only when you have confirmed the exact model from at least 2 sources.

2. RECOGNIZE PRODUCT FAMILIES: If the user enters a recognizable product name like "Xbox 360", "PlayStation 5", "Nintendo Switch", "iPhone 15 Pro", "RTX 4090", or "MacBook Air M2", identify that product successfully. You do NOT need an exact hardware revision or model number to return a result.

3. EXACT VS PARTIAL: If you can determine the exact model/variant, include it. If multiple variants exist and you cannot determine which one the user means (e.g. Xbox 360 vs Xbox 360 S vs Xbox 360 E), return the product family name (e.g. "Microsoft Xbox 360") and set confidence to "medium". Do NOT reject the search just because multiple versions exist.

4. AMAZON SEARCH — MANDATORY: Always search Amazon for this product. Include the Amazon product page URL in the "amazonUrl" field AND in the "productLinks" array. If the product is not on Amazon, search for it and report the closest Amazon listing or search URL. This is required for every product.

5. PRODUCT LINKS: Return up to 5 product links in the "productLinks" array. Each URL should be a real page for this product (not a search results page). Always include Amazon first, then use different retailers when possible (manufacturer page, eBay, Best Buy, Walmart, B&H, Newegg). If you cannot find 5 links, return as many real ones as you can — even 1 is acceptable.

6. HIGHEST/RETAIL PRICE — CONSISTENT: Search broadly across the manufacturer's official store, major retailers, and marketplaces including Amazon, eBay, Best Buy, Walmart, B&H, Newegg, Target, and other sellers. Find the highest legitimate current retail or listed sale price for the EXACT product identified. The price must correspond to the exact product you identified — not a different variant, bundle, or accessory. Prefer a new/sealed retail price over used, open-box, parts-only, auction bid, or accessory prices. Return the single highest reliable price you can find in USD. Do not use an MSRP or price you cannot verify from a source page. Only return 0 when no legitimate price can be found anywhere after searching. The price should be DETERMINISTIC — if the same product is searched again, the same price should be returned because it is the verified highest retail price for that exact product.

7. HIGHEST PRICE SOURCE URL: Include "highestPriceSourceUrl" as the direct, clickable product/listing URL where that highest price is shown. This field is required whenever highestPrice is greater than 0. Never leave it empty if any reliable price was found. The URL must be a real product page, not a search results page.

8. AUTHENTICITY / FAKE DETECTION: Determine if the product is likely genuine or if counterfeit/knockoff versions are common. Search for known counterfeit issues, fake detection guides, and authenticity concerns for this specific product. Return:
   - "authenticity": one of "genuine", "likely_genuine", "uncertain", "likely_fake", "fake"
   - "authenticityNote": a brief explanation (1-2 sentences) of why, including any known counterfeit indicators, serial number check advice, or red flags to watch for. If the product is from a reputable brand with no known counterfeiting issues, state that.

9. SPECS: Combine the product description AND specifications into a single array of bullet-point strings. Include brand, model, key specs, and 2-3 description sentences — each as its own bullet.

10. BARCODE MODE: If this is a barcode search, try to map it to a specific product. Barcode searches should be more precise, but if the barcode maps to a product family rather than a specific SKU, still return the product.

Return ONLY valid JSON in this exact shape (no markdown, no code blocks, no extra text):
{
  "title": "product name including brand",
  "specs": ["Brand: ...", "Model: ...", "spec 1", "spec 2", "description sentence 1"],
  "highestPrice": 0,
  "highestPriceSourceUrl": "required direct URL of the listing showing the highest price; empty only if no legitimate price can be found",
  "amazonUrl": "direct Amazon product page URL, or Amazon search URL if no product page found",
  "productLinks": ["amazon url first", "url2", "url3"],
  "confidence": "high | medium | low",
  "authenticity": "genuine | likely_genuine | uncertain | likely_fake | fake",
  "authenticityNote": "brief explanation of authenticity assessment and any red flags"
}

Only return empty title with confidence "low" if the query is genuinely meaningless or does not correspond to any real product (e.g. "xyzunknownthing12345"). A recognizable product name is always enough to return a result.`;
}

const VISION_PROMPT = `You are identifying the exact product shown in the provided image. Examine the image very carefully with maximum attention to detail.

Look for ALL of these:
- Brand names and logos (on the product, packaging, labels, or screen)
- Model numbers and product codes (printed on labels, stickers, engravings, or molded into the plastic)
- Serial numbers or batch codes
- Any visible text on the product or its packaging
- Product shape, color, design language, and distinctive features
- Packaging details that indicate the exact variant or edition

Identify the product and return ONLY valid JSON (no markdown, no code blocks) in this exact shape:
{
  "title": "exact product name including brand and model",
  "brand": "brand name",
  "model": "model number if visible, otherwise empty string",
  "description": "brief description of what the product is, including any visible features",
  "confidence": "high | medium | low"
}

Rules:
- Read ALL visible text: labels, stickers, engravings, packaging, screens, and any printed markings.
- If you can see a model number, include it exactly as printed, including hyphens and spaces.
- Look at the product's physical design, color, and form factor to help identify the exact variant.
- If you cannot identify the product with reasonable confidence, return empty title and confidence "low".
- Do NOT guess or invent details. Only report what you can actually see in the image.
- If the image is blurry, dark, or unclear, note that in the description and set confidence to "low" or "medium".`;

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

  // Amazon URL always goes first
  const amazonUrl = primary.amazonUrl || priceResult?.amazonUrl || "";
  if (amazonUrl) {
    allLinks.add(amazonUrl);
  }

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

  if (!highestPriceSourceUrl && highestPrice > 0) {
    highestPriceSourceUrl = Array.from(allLinks)[0] || "";
  }
  if (highestPriceSourceUrl) addLink(highestPriceSourceUrl);

  // Build final links array with Amazon first
  const orderedLinks: string[] = [];
  if (amazonUrl) orderedLinks.push(amazonUrl);
  for (const link of allLinks) {
    if (link !== amazonUrl) orderedLinks.push(link);
  }

  const result: ProductResult = {
    title: primary.title || "",
    specs: primary.specs || [],
    highestPrice,
    highestPriceSourceUrl,
    finalPrice: 0,
    priceNote: "",
    productLinks: orderedLinks,
    confidence: primary.confidence || "medium",
    authenticity: primary.authenticity || "uncertain",
    authenticityNote: primary.authenticityNote || "",
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
            { type: "image_url", image_url: { url: image, detail: "high" } },
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
    const content = await callOpenAIResponses(openaiKey, searchModel, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildSearchPrompt(searchQuery, searchType) },
    ]);

    let mainResult: PartialResult;
    try {
      mainResult = JSON.parse(extractJson(content));
    } catch {
      return new Response(
        JSON.stringify({ error: "The live search returned an unreadable result. Try the model number again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = mergeResults(mainResult, null);

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
