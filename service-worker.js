// === Storage Helpers (inlined to avoid importScripts issues) ===
const Storage = {
  async getApiKey() {
    const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
    return geminiApiKey || null;
  },
  async addWord(entry) {
    const { words = [] } = await chrome.storage.local.get("words");
    const existingIndex = words.findIndex(
      (w) => w.word.toLowerCase() === entry.word.toLowerCase()
    );
    if (existingIndex !== -1) {
      words[existingIndex] = { ...words[existingIndex], ...entry, id: words[existingIndex].id };
    } else {
      words.unshift(entry);
    }
    await chrome.storage.local.set({ words });
    return entry;
  },
};

// === Gemini API ===
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;
  const jsonStr = rawText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(jsonStr);
}

// === Context Menu ===
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ocr-capture",
    title: "OCR 擷取單字",
    contexts: ["page", "image"],
  });
});

// === Send message with fallback injection ===
async function sendToContentScript(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/tesseract.min.js", "content/content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/content.css"],
    });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ocr-capture") {
    sendToContentScript(tab.id, { type: "ACTIVATE_OCR" });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "activate-ocr") {
    sendToContentScript(tab.id, { type: "ACTIVATE_OCR" });
  }
});

// === Message Handler ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_TAB") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (msg.type === "TRANSLATE_WORD") {
    (async () => {
      try {
        const apiKey = await Storage.getApiKey();
        if (!apiKey) {
          sendResponse({
            success: false,
            error: "請先在設定頁面中輸入 Gemini API Key",
          });
          return;
        }

        const details = await getWordDetails(msg.word, apiKey);
        const wordEntry = {
          id: Date.now().toString(),
          word: msg.word,
          translation: details.translation,
          partOfSpeech: details.partOfSpeech,
          example: details.example,
          exampleTranslation: details.exampleTranslation,
          pinned: false,
          createdAt: new Date().toISOString(),
        };

        await Storage.addWord(wordEntry);
        sendResponse({ success: true, data: wordEntry });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
