const wordGrid = document.getElementById("word-grid");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort-mode");
const wordCountEl = document.getElementById("word-count");

let allWords = [];

function sortWords(words, mode) {
  const pinned = words.filter((w) => w.pinned);
  const unpinned = words.filter((w) => !w.pinned);

  switch (mode) {
    case "alpha":
      unpinned.sort((a, b) => a.word.localeCompare(b.word));
      break;
    case "random":
      for (let i = unpinned.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unpinned[i], unpinned[j]] = [unpinned[j], unpinned[i]];
      }
      break;
    case "date":
    default:
      unpinned.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
  }

  return [...pinned, ...unpinned];
}

async function loadWords() {
  const { words = [] } = await chrome.storage.local.get("words");
  allWords = sortWords(words, sortSelect.value);
  renderWords(allWords);
}

function renderWords(words) {
  wordCountEl.textContent = `${words.length} 個單字`;

  if (words.length === 0) {
    wordGrid.style.display = "none";
    emptyState.style.display = "flex";
    return;
  }

  wordGrid.style.display = "grid";
  emptyState.style.display = "none";

  wordGrid.innerHTML = words
    .map(
      (w) => `
    <div class="word-card ${w.pinned ? "pinned" : ""}" data-id="${w.id}">
      <div class="card-header">
        <div class="card-word">${escapeHtml(w.word)}</div>
        <div class="card-actions">
          <button class="btn-pin" title="${w.pinned ? "取消置頂" : "置頂"}" data-id="${w.id}">
            ${w.pinned ? "📌" : "📍"}
          </button>
          <button class="btn-delete" title="刪除" data-id="${w.id}">🗑️</button>
        </div>
      </div>
      <div class="card-pos">${escapeHtml(w.partOfSpeech)}</div>
      <div class="card-translation">${escapeHtml(w.translation)}</div>
      <div class="card-example">${escapeHtml(w.example)}</div>
      <div class="card-example-tr">${escapeHtml(w.exampleTranslation)}</div>
      <div class="card-date">${formatDate(w.createdAt)}</div>
    </div>
  `
    )
    .join("");

  // Bind event listeners
  wordGrid.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.id;
      const card = e.currentTarget.closest(".word-card");
      card.style.opacity = "0";
      card.style.transform = "scale(0.95)";
      setTimeout(async () => {
        const { words = [] } = await chrome.storage.local.get("words");
        await chrome.storage.local.set({
          words: words.filter((w) => w.id !== id),
        });
        loadWords();
      }, 200);
    });
  });

  wordGrid.querySelectorAll(".btn-pin").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.id;
      const { words = [] } = await chrome.storage.local.get("words");
      const word = words.find((w) => w.id === id);
      if (word) {
        word.pinned = !word.pinned;
        await chrome.storage.local.set({ words });
        loadWords();
      }
    });
  });
}

// Sort mode change
sortSelect.addEventListener("change", () => {
  allWords = sortWords(allWords, sortSelect.value);
  const query = searchInput.value.toLowerCase().trim();
  if (query) {
    const filtered = allWords.filter(
      (w) => w.word.toLowerCase().includes(query) || w.translation.includes(query)
    );
    renderWords(filtered);
  } else {
    renderWords(allWords);
  }
});

// Search/filter
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderWords(allWords);
    return;
  }
  const filtered = allWords.filter(
    (w) =>
      w.word.toLowerCase().includes(query) ||
      w.translation.includes(query)
  );
  renderWords(filtered);
});

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Initial load
loadWords();

// Refresh when storage changes (e.g., new word captured from another tab)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.words) loadWords();
});
