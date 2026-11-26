import type { AppSettings, ScannedReceiptRaw } from '../types/receipt'
import { todayIsoDate } from './format'

export const GEMINI_MODELS = [
  {
    id: 'gemini-3.5-flash-lite' as const,
    label: 'gemini-3.5-flash-lite',
    badge: 'Default · Free',
    description: 'Fast multimodal receipt scanning on the free AI Studio tier.',
  },
  {
    id: 'gemini-3.6-flash' as const,
    label: 'gemini-3.6-flash',
    badge: 'Sharper · Free',
    description: 'Higher accuracy on crumpled, long, or handwritten-tip receipts.',
  },
  {
    id: 'gemini-2.5-flash-lite' as const,
    label: 'gemini-2.5-flash-lite',
    badge: 'Legacy Fallback',
    description: 'Stable previous-gen free tier fallback model.',
  },
  {
    id: 'custom' as const,
    label: 'Custom model ID',
    badge: 'Advanced',
    description: 'Specify any Gemini v1beta model ID manually.',
  },
]

export function resolveModelId(settings: Pick<AppSettings, 'geminiModel' | 'customGeminiModel'>): string {
  if (settings.geminiModel === 'custom') {
    return settings.customGeminiModel.trim() || 'gemini-3.5-flash-lite'
  }
  return settings.geminiModel || 'gemini-3.5-flash-lite'
}

const RECEIPT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: {
      type: 'STRING',
      description: 'Store or restaurant name at the top of the receipt.',
    },
    date: {
      type: 'STRING',
      description: 'Receipt date formatted as YYYY-MM-DD if visible, otherwise empty string.',
    },
    currency: {
      type: 'STRING',
      description:
        '3-letter ISO 4217 currency code if clearly indicated on the receipt (e.g., USD, EUR, GBP, JPY, CAD), otherwise empty string.',
    },
    items: {
      type: 'ARRAY',
      description:
        'Purchased line items only (exclude subtotal, tax, tip, total, payment method, and change lines).',
      items: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            description: 'Clean readable item name without leading quantity prefix.',
          },
          quantity: {
            type: 'INTEGER',
            description: 'Quantity purchased (integer >= 1).',
          },
          totalPrice: {
            type: 'NUMBER',
            description:
              'Total line price in dollars for this row (e.g., if 2 tacos cost $12.00 total, return 12.00).',
          },
        },
        required: ['name', 'quantity', 'totalPrice'],
      },
    },
    tax: {
      type: 'NUMBER',
      description: 'Total tax amount in dollars (0 if none visible).',
    },
    tip: {
      type: 'NUMBER',
      description: 'Tip or gratuity amount in dollars (0 if none visible or blank).',
    },
    extraFee: {
      type: 'NUMBER',
      description:
        'Service fee, kitchen fee, delivery fee, or surcharge in dollars (0 if none).',
    },
    discount: {
      type: 'NUMBER',
      description:
        'Positive dollar amount of any coupons, promos, or discounts subtracted from the bill (0 if none).',
    },
  },
  required: ['merchant', 'date', 'items', 'tax', 'tip', 'extraFee', 'discount'],
}

const RECEIPT_PROMPT = `Extract all line items and bill totals from this receipt image into the JSON schema.
Rules:
1. Ignore any blacked-out/redacted areas completely.
2. Include only purchased food/drink/product items in "items". Do NOT include Subtotal, Tax, Tip, Total, Balance, Cash, Card, or Change as items.
3. For each item, "totalPrice" must be the extended line total shown on the right side of that row (positive number in dollars). Set "quantity" to the integer count shown (default 1).
4. If an item has modifiers/add-ons priced at $0.00, omit the $0.00 modifier row or fold it into the item name.
5. Put service charges / health mandates / auto-gratuity fees into "extraFee" (or "tip" if labeled gratuity/tip).
6. Put any discounts/coupons as a positive number in "discount".
7. Format "date" as YYYY-MM-DD when readable, or empty string if missing.`

function buildEndpoint(modelId: string): string {
  const safeModel = encodeURIComponent(modelId.replace(/^models\//, ''))
  return `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`
}

async function parseGeminiError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    const msg = data?.error?.message
    if (typeof msg === 'string' && msg.trim()) {
      if (response.status === 400 && /API key/i.test(msg)) {
        return 'Invalid Gemini API key. Check your key in Settings.'
      }
      if (response.status === 403) {
        return `API key forbidden (403): ${msg}`
      }
      if (response.status === 404) {
        return `Model not found (404): ${msg}. Try switching models in Settings.`
      }
      if (response.status === 429) {
        return 'Rate limit reached on free tier (429). Wait a few seconds and retry, or switch to gemini-3.5-flash-lite.'
      }
      return msg
    }
  } catch {
    // ignore JSON parse failure
  }
  return `Gemini API returned HTTP ${response.status}.`
}

/**
 * Calls Google Gemini REST API using the user's own API key via x-goog-api-key header.
 * Note: Temperature is intentionally left unset (default) for Gemini 3.x models.
 */
export async function scanReceiptWithGemini(options: {
  apiKey: string
  modelId: string
  jpegBase64: string
}): Promise<ScannedReceiptRaw> {
  const apiKey = options.apiKey.trim()
  if (!apiKey) {
    throw new Error('Add your free Gemini API key in Settings first.')
  }

  const endpoint = buildEndpoint(options.modelId)
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: RECEIPT_PROMPT },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: options.jpegBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECEIPT_RESPONSE_SCHEMA,
    },
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(await parseGeminiError(response))
  }

  const json = await response.json()
  const rawText: string | undefined =
    json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim()

  if (!rawText) {
    throw new Error(
      'Gemini did not return receipt text. Try cropping tighter around the items and scanning again.'
    )
  }

  let parsed: Partial<ScannedReceiptRaw>
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Could not parse structured receipt JSON from Gemini.')
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((item) => ({
          name: String(item?.name ?? '').trim() || 'Item',
          quantity: Math.max(1, Math.round(Number(item?.quantity ?? 1) || 1)),
          totalPrice: Math.max(0, Number(item?.totalPrice ?? 0) || 0),
        }))
        .filter((item) => item.totalPrice > 0 || item.name !== 'Item')
    : []

  return {
    merchant: String(parsed.merchant ?? '').trim() || 'Scanned Receipt',
    date: String(parsed.date ?? '').trim() || todayIsoDate(),
    currency: String(parsed.currency ?? '').trim().toUpperCase() || undefined,
    items,
    tax: Math.max(0, Number(parsed.tax ?? 0) || 0),
    tip: Math.max(0, Number(parsed.tip ?? 0) || 0),
    extraFee: Math.max(0, Number(parsed.extraFee ?? 0) || 0),
    discount: Math.max(0, Math.abs(Number(parsed.discount ?? 0) || 0)),
  }
}

export async function testGeminiApiKey(
  apiKey: string,
  modelId: string
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) {
    return { ok: false, message: 'Enter an API key first.' }
  }

  try {
    const response = await fetch(buildEndpoint(modelId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
    })

    if (!response.ok) {
      return { ok: false, message: await parseGeminiError(response) }
    }

    return {
      ok: true,
      message: `Connected! ${modelId} is ready to scan receipts.`,
    }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Network error testing API key.',
    }
  }
}
