// Google Gemini API client for word translation

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

async function getWordDetails(word, apiKey) {
  const prompt = `You are a dictionary assistant. For the English word "${word}", provide:
1. Chinese translation (简体中文, concise)
2. Part of speech (e.g. noun, verb, adjective, adverb, etc.)
3. One example sentence in English using this word naturally
4. Chinese translation of that example sentence

Respond ONLY with this exact JSON format, no markdown, no code fences:
{"translation":"中文翻译","partOfSpeech":"part of speech","example":"English example sentence","exampleTranslation":"例句的中文翻译"}`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 256,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;

  // Strip markdown code fences if present
  const jsonStr = rawText
    .replace(/```json?\s*/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(jsonStr);
}
