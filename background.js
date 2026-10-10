chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "DOWNLOAD_VIDEO_URL") {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename || `grabbed_video_${Date.now()}.mp4`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }
});