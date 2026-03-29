// chrome.storage.local helper utilities

const Storage = {
  async getApiKey() {
    const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
    return geminiApiKey || null;
  },

  async setApiKey(key) {
    await chrome.storage.local.set({ geminiApiKey: key });
  },

  async getWords() {
    const { words = [] } = await chrome.storage.local.get("words");
    // Pinned items first, then by creation date (newest first)
    return words.sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  },

  async addWord(entry) {
    const { words = [] } = await chrome.storage.local.get("words");
    // Check for duplicate
    const existingIndex = words.findIndex(
      (w) => w.word.toLowerCase() === entry.word.toLowerCase()
    );
    if (existingIndex !== -1) {
      // Update existing entry
      words[existingIndex] = { ...words[existingIndex], ...entry, id: words[existingIndex].id };
    } else {
      words.unshift(entry);
    }
    await chrome.storage.local.set({ words });
    return entry;
  },

  async deleteWord(id) {
    const { words = [] } = await chrome.storage.local.get("words");
    const filtered = words.filter((w) => w.id !== id);
    await chrome.storage.local.set({ words: filtered });
  },

  async togglePin(id) {
    const { words = [] } = await chrome.storage.local.get("words");
    const word = words.find((w) => w.id === id);
    if (word) {
      word.pinned = !word.pinned;
      await chrome.storage.local.set({ words });
    }
    return word;
  },
};
