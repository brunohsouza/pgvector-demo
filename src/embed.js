import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'

// Choose with EMBEDDINGS_PROVIDER: openai (default) | gemini | voyage | fake.
// Anthropic has no embedding model of its own; its docs point to Voyage AI.
const providers = {
  openai: { model: 'text-embedding-3-small', dim: 1536, embed: embedOpenAI },  // OPENAI_API_KEY
  gemini: { model: 'gemini-embedding-001', dim: 1536, embed: embedGemini },    // GEMINI_API_KEY
  voyage: { model: 'voyage-4', dim: 1024, embed: embedVoyage },                // VOYAGE_API_KEY
  fake: { model: 'word-hash', dim: 1536, embed: async (input) => input.map(fakeEmbedding) },
}

export const PROVIDER = process.env.EMBEDDINGS_PROVIDER ?? 'openai'
const provider = providers[PROVIDER]
if (!provider) throw new Error(`Unknown EMBEDDINGS_PROVIDER "${PROVIDER}"`)
export const { model: MODEL, dim: DIM } = provider
export const LABEL = `${PROVIDER} · ${MODEL} · ${DIM} dimensions`

// One API call for many texts; returns one vector per text, in order.
// kind is 'document' for stored rows and 'query' for questions: Gemini and
// Voyage embed the two slightly differently, OpenAI ignores it.
export async function embed(texts, kind = 'document') {
  const input = Array.isArray(texts) ? texts : [texts]
  return provider.embed(input, kind)
}

let openai
async function embedOpenAI(input) {
  openai ??= new OpenAI()
  const { data } = await openai.embeddings.create({ model: MODEL, input })
  return vectorsByIndex(data)
}

let gemini
async function embedGemini(input, kind) {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const { embeddings } = await gemini.models.embedContent({
    model: MODEL,
    contents: input,
    config: {
      outputDimensionality: DIM, // default is 3072, over the HNSW limit of 2,000
      taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
    },
  })
  // Google asks for vectors below 3072 dimensions to be normalised by hand.
  return embeddings.map((e) => normalise(e.values))
}

async function embedVoyage(input, kind) {
  const base = process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com/v1'
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input, input_type: kind }),
  })
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`)
  const { data } = await res.json()
  return vectorsByIndex(data)
}

// OpenAI and Voyage both return { index, embedding } items; put them back in input order.
const vectorsByIndex = (data) => data.toSorted((a, b) => a.index - b.index).map((d) => d.embedding)

function normalise(v) {
  const norm = Math.hypot(...v) || 1
  return v.map((x) => x / norm)
}

// For testing the plumbing without an API key. It hashes words, so it
// matches shared words only: it does NOT understand meaning.
function fakeEmbedding(text) {
  const v = new Array(DIM).fill(0)
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 0
    for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0
    v[h % DIM] += 1
  }
  return normalise(v)
}
