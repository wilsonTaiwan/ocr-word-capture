document.getElementById("btn-wordlist").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/wordlist.html") });
});

document.getElementById("btn-settings").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/settings.html") });
});
