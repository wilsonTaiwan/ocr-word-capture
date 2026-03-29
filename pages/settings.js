const apiKeyInput = document.getElementById("api-key");
const btnSave = document.getElementById("btn-save");
const btnTest = document.getElementById("btn-test");
const btnToggle = document.getElementById("btn-toggle");
const statusMsg = document.getElementById("status-msg");

// Load saved key on page open
chrome.storage.local.get("geminiApiKey", ({ geminiApiKey }) => {
  if (geminiApiKey) {
    apiKeyInput.value = geminiApiKey;
  }
});

// Toggle password visibility
btnToggle.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

// Save API key
btnSave.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("請輸入 API Key", "error");
    return;
  }
  await chrome.storage.local.set({ geminiApiKey: key });
  showStatus("已儲存！", "success");
});

// Test API key
btnTest.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("請先輸入 API Key", "error");
    return;
  }

  showStatus("測試中...", "info");
  btnTest.disabled = true;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say hello in one word." }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      }
    );

    if (response.ok) {
      showStatus("連線成功！API Key 有效。", "success");
    } else {
      const err = await response.json();
      showStatus(`連線失敗：${err.error?.message || response.status}`, "error");
    }
  } catch (e) {
    showStatus(`連線錯誤：${e.message}`, "error");
  } finally {
    btnTest.disabled = false;
  }
});

function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = "status-msg " + type;
}
