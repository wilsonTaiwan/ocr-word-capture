(() => {
  let isSelecting = false;
  let overlayHost = null;
  let startX = 0;
  let startY = 0;

  // Listen for activation message from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ACTIVATE_OCR") {
      activateOCR();
    }
  });

  function activateOCR() {
    if (isSelecting) return;
    isSelecting = true;

    // Create fullscreen overlay with Shadow DOM
    overlayHost = document.createElement("div");
    overlayHost.className = "ocr-overlay-host";
    const shadow = overlayHost.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.15);
          cursor: crosshair;
          user-select: none;
        }
        .selection-rect {
          position: fixed;
          border: 2px solid #4A90D9;
          background: rgba(74, 144, 217, 0.15);
          pointer-events: none;
          display: none;
        }
        .hint {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.8);
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          pointer-events: none;
        }
      </style>
      <div class="overlay">
        <div class="hint">拖曳滑鼠選取要辨識的區域，按 Esc 取消</div>
        <div class="selection-rect"></div>
      </div>
    `;

    const overlay = shadow.querySelector(".overlay");
    const rect = shadow.querySelector(".selection-rect");

    let dragging = false;

    overlay.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      rect.style.display = "block";
      rect.style.left = startX + "px";
      rect.style.top = startY + "px";
      rect.style.width = "0px";
      rect.style.height = "0px";
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      rect.style.left = x + "px";
      rect.style.top = y + "px";
      rect.style.width = w + "px";
      rect.style.height = h + "px";
    });

    overlay.addEventListener("mouseup", async (e) => {
      if (!dragging) return;
      dragging = false;

      const endX = e.clientX;
      const endY = e.clientY;
      const selX = Math.min(startX, endX);
      const selY = Math.min(startY, endY);
      const selW = Math.abs(endX - startX);
      const selH = Math.abs(endY - startY);

      // Remove overlay immediately
      cleanup();

      // Ignore tiny selections (accidental clicks)
      if (selW < 10 || selH < 5) return;

      await processSelection(selX, selY, selW, selH);
    });

    // Esc to cancel
    const escHandler = (e) => {
      if (e.key === "Escape") {
        cleanup();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    document.body.appendChild(overlayHost);

    function cleanup() {
      isSelecting = false;
      if (overlayHost && overlayHost.parentNode) {
        overlayHost.parentNode.removeChild(overlayHost);
      }
      overlayHost = null;
    }
  }

  async function processSelection(x, y, w, h) {
    // Step 1: Request screenshot from background
    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_TAB" });
    if (!response || !response.dataUrl) {
      showTooltip(x, y + h, null, "截圖失敗，請重試");
      return;
    }

    // Step 2: Crop the selected area
    const croppedDataUrl = await cropScreenshot(response.dataUrl, x, y, w, h);

    // Step 3: Show loading tooltip
    const tooltip = showTooltip(x, y + h, null, "辨識中...");

    // Step 4: Run OCR
    try {
      const word = await runOCR(croppedDataUrl);
      if (!word) {
        updateTooltip(tooltip, null, "未能辨識出英文單字");
        return;
      }

      // Update tooltip with recognized word
      updateTooltip(tooltip, { word }, "翻譯中...");

      // Step 5: Request translation from background
      const result = await chrome.runtime.sendMessage({
        type: "TRANSLATE_WORD",
        word,
      });

      if (result.success) {
        updateTooltip(tooltip, result.data, null);
      } else {
        updateTooltip(tooltip, { word }, result.error);
      }
    } catch (e) {
      updateTooltip(tooltip, null, "辨識錯誤：" + e.message);
    }
  }

  function cropScreenshot(dataUrl, x, y, w, h) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          x * dpr,
          y * dpr,
          w * dpr,
          h * dpr,
          0,
          0,
          canvas.width,
          canvas.height
        );
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = dataUrl;
    });
  }

  async function runOCR(imageDataUrl) {
    const workerPath = chrome.runtime.getURL("lib/worker.min.js");
    const corePath = chrome.runtime.getURL("lib/tesseract-core-simd-lstm.wasm.js");
    const langPath = chrome.runtime.getURL("traineddata");

    const worker = await Tesseract.createWorker("eng", 1, {
      workerPath,
      corePath,
      langPath,
    });

    const {
      data: { text },
    } = await worker.recognize(imageDataUrl);
    await worker.terminate();

    // Extract the first meaningful English word (at least 2 chars)
    const cleaned = text.trim();
    const match = cleaned.match(/[a-zA-Z]{2,}/);
    return match ? match[0].toLowerCase() : null;
  }

  // --- Floating Tooltip ---

  function showTooltip(x, y, data, statusText) {
    const host = document.createElement("div");
    host.className = "ocr-tooltip-host";
    host.style.left = x + "px";
    host.style.top = y + 8 + "px";

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .tooltip {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #1a1a2e;
          color: #e0e0e0;
          border: 1px solid #2a2a4a;
          border-radius: 12px;
          padding: 14px 16px;
          min-width: 220px;
          max-width: 360px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .word {
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 2px;
        }
        .pos {
          font-size: 12px;
          color: #4A90D9;
          margin-bottom: 8px;
        }
        .translation {
          font-size: 15px;
          color: #4ade80;
          margin-bottom: 8px;
        }
        .example {
          font-size: 13px;
          color: #ccc;
          font-style: italic;
          margin-bottom: 4px;
        }
        .example-tr {
          font-size: 12px;
          color: #888;
        }
        .status {
          font-size: 13px;
          color: #60a5fa;
        }
        .error {
          font-size: 13px;
          color: #f87171;
        }
        .close-btn {
          position: absolute;
          top: 6px;
          right: 10px;
          background: none;
          border: none;
          color: #666;
          font-size: 16px;
          cursor: pointer;
          padding: 2px 6px;
        }
        .close-btn:hover {
          color: #fff;
        }
      </style>
      <div class="tooltip" style="position:relative;">
        <button class="close-btn">&times;</button>
        <div class="content"></div>
      </div>
    `;

    const content = shadow.querySelector(".content");
    const closeBtn = shadow.querySelector(".close-btn");

    closeBtn.addEventListener("click", () => host.remove());

    renderContent(content, data, statusText);

    document.body.appendChild(host);

    // Reposition if tooltip goes off screen
    requestAnimationFrame(() => {
      const tooltipEl = shadow.querySelector(".tooltip");
      const rect = tooltipEl.getBoundingClientRect();
      const hostLeft = parseFloat(host.style.left);
      const hostTop = parseFloat(host.style.top);

      if (hostLeft + rect.width > window.innerWidth - 16) {
        host.style.left = Math.max(16, window.innerWidth - rect.width - 16) + "px";
      }
      if (hostTop + rect.height > window.innerHeight - 16) {
        host.style.top = Math.max(16, hostTop - rect.height - 24) + "px";
      }
    });

    // Auto-dismiss after 12 seconds
    const timer = setTimeout(() => host.remove(), 12000);
    host._timer = timer;
    host._shadow = shadow;

    return host;
  }

  function updateTooltip(host, data, statusText) {
    if (!host || !host._shadow) return;
    const content = host._shadow.querySelector(".content");
    if (content) {
      renderContent(content, data, statusText);
    }
    // Reset auto-dismiss timer
    if (host._timer) clearTimeout(host._timer);
    host._timer = setTimeout(() => host.remove(), 12000);
  }

  function renderContent(container, data, statusText) {
    let html = "";
    if (data) {
      html += `<div class="word">${escapeHtml(data.word)}</div>`;
      if (data.partOfSpeech) {
        html += `<div class="pos">${escapeHtml(data.partOfSpeech)}</div>`;
      }
      if (data.translation) {
        html += `<div class="translation">${escapeHtml(data.translation)}</div>`;
      }
      if (data.example) {
        html += `<div class="example">${escapeHtml(data.example)}</div>`;
      }
      if (data.exampleTranslation) {
        html += `<div class="example-tr">${escapeHtml(data.exampleTranslation)}</div>`;
      }
    }
    if (statusText) {
      const cls = statusText.includes("錯誤") || statusText.includes("失敗") || statusText.includes("未能")
        ? "error"
        : "status";
      html += `<div class="${cls}">${escapeHtml(statusText)}</div>`;
    }
    container.innerHTML = html;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
