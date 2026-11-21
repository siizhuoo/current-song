// Current Song: make-card
// Turns my handwritten words + sliders + chosen color into card settings for the renderer.
// The AI is blind to the song: only the four fields below are ever sent to it.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor,
// name it "make-card", paste this file, keep "Verify JWT" on, Deploy.
// Needs the secret GEMINI_API_KEY. Optional secret GEMINI_MODEL (default below).

const ALLOWED_ORIGIN = 'https://siizhuoo.github.io';
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (v, lo, hi, fallback) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

const INSTRUCTIONS = `You design abstract animated cards for a private music-mood diary.
You receive a person's own words about how a song feels to them right now, two sliders (0 to 1) and the main color they chose.
You never see the song. Do not guess it. Do not write any words; return only the settings.

Rules:
- palette: 4 colors. Keep every hue close to the chosen color (within about 40 degrees on the color wheel) and vary tint, shade and vibrance to express the words. The first color is the strongest.
- background: one soft color that lets the palette glow. Brighter when positivity is high, deeper when it is low.
- motion: "pulse" for steady heartbeats or warmth, "drift" for floating, wistful or quiet moods, "burst" for joy, release or intensity.
- pace: 0.2 (very slow) to 2.0 (very fast). Follow energy, adjusted by the words.
- lobes: 3 to 7. Fewer is simpler and calmer; more is busier.
- sharpness: 0 (smooth blob) to 0.35 (spiky). Soft feelings smooth, tense or electric feelings sharper.
- Every request is a fresh interpretation: use the variation number to explore a different reading of the same words.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    palette: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 4, maxItems: 4 },
    background: { type: 'STRING' },
    motion: { type: 'STRING', enum: ['pulse', 'drift', 'burst'] },
    pace: { type: 'NUMBER' },
    lobes: { type: 'INTEGER' },
    sharpness: { type: 'NUMBER' },
  },
  required: ['palette', 'background', 'motion', 'pace', 'lobes', 'sharpness'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return reply({ error: 'GEMINI_API_KEY secret is not set.' }, 500);

  let input;
  try { input = await req.json(); } catch { return reply({ error: 'Body must be JSON.' }, 400); }

  // Only these fields are read. Anything else (song title, artist) is ignored on purpose.
  const words = String(input.words || '').trim().slice(0, 500);
  const energy = clamp(input.energy, 0, 1, null);
  const positivity = clamp(input.positivity, 0, 1, null);
  const color = String(input.color || '');
  if (!words || energy === null || positivity === null || !HEX.test(color)) {
    return reply({ error: 'Send words, energy (0-1), positivity (0-1) and color (#rrggbb).' }, 400);
  }
  const variation = Math.floor(Math.random() * 1e6);

  const gemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ words, energy, positivity, color, variation }) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 1.1 },
    }),
  });

  const data = await gemini.json().catch(() => ({}));
  if (!gemini.ok) return reply({ error: `Gemini error ${gemini.status}: ${data?.error?.message || 'no details'}` }, 502);

  let card;
  try { card = JSON.parse(data.candidates[0].content.parts[0].text); }
  catch { return reply({ error: 'Gemini returned something that is not card settings.' }, 502); }

  // Never trust the model's output blindly: clean every field before it reaches the app.
  const palette = (Array.isArray(card.palette) ? card.palette : []).filter((c) => HEX.test(c)).slice(0, 4);
  while (palette.length < 4) palette.push(color);
  return reply({
    card: {
      palette,
      background: HEX.test(card.background) ? card.background : '#F2F1F6',
      motion: ['pulse', 'drift', 'burst'].includes(card.motion) ? card.motion : 'pulse',
      pace: clamp(card.pace, 0.2, 2, 0.35 + energy * 1.5),
      lobes: Math.round(clamp(card.lobes, 3, 7, 5)),
      sharpness: clamp(card.sharpness, 0, 0.35, 0.1),
      seed: Math.floor(Math.random() * 1e9),
      model: MODEL,
    },
  });
});
