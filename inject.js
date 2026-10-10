(function () {
  if (window.__vcamStudioLoaded) return;
  window.__vcamStudioLoaded = true;

  // Global Engine State
  const state = {
    mode: "real", // "real" | "video" | "snapshot" | "grabbed"
    videoEl: document.createElement("video"),
    imageEl: new Image(),
    canvas: document.createElement("canvas"),
    ctx: null,
    brightness: 100,
    contrast: 100,
    noise: 0,
    fps: 30,
    activeVideoTrack: null,
    targetPageVideo: null,
    // Customizable hotkey configuration (stored in localStorage)
    shortcut: JSON.parse(localStorage.getItem("__kot_mockcam_shortcut") || JSON.stringify({
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      key: "a",
      label: "Alt + A"
    }))
  };

  state.canvas.width = 1280;
  state.canvas.height = 720;
  state.ctx = state.canvas.getContext("2d", { willReadFrequently: true });

  state.videoEl.loop = true;
  state.videoEl.muted = true;
  state.videoEl.playsInline = true;
  state.videoEl.crossOrigin = "anonymous";

  // Canvas processing pipeline
  function renderPipeline() {
    if (state.mode === "real") {
      requestAnimationFrame(renderPipeline);
      return;
    }

    const { ctx, canvas, brightness, contrast, noise } = state;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

    try {
      if (state.mode === "grabbed" && state.targetPageVideo && state.targetPageVideo.readyState >= 2) {
        ctx.drawImage(state.targetPageVideo, 0, 0, canvas.width, canvas.height);
      } else if (state.mode === "video" && state.videoEl.readyState >= 2) {
        ctx.drawImage(state.videoEl, 0, 0, canvas.width, canvas.height);
      } else if (state.mode === "snapshot" && state.imageEl.complete && state.imageEl.src) {
        ctx.drawImage(state.imageEl, 0, 0, canvas.width, canvas.height);
      }
    } catch (e) {}

    if (noise > 0) {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const factor = noise * 2.55;
        for (let i = 0; i < data.length; i += 4) {
          const grain = (Math.random() - 0.5) * factor;
          data[i] = Math.min(255, Math.max(0, data[i] + grain));
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (e) {}
    }

    requestAnimationFrame(renderPipeline);
  }
  requestAnimationFrame(renderPipeline);

  // WebRTC API Hooks
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

  navigator.mediaDevices.enumerateDevices = async function () {
    const devices = await originalEnumerateDevices();
    if (!devices.some(d => d.kind === "videoinput")) {
      devices.push({
        deviceId: "kot-mockcam-device",
        groupId: "kot-mockcam-group",
        kind: "videoinput",
        label: "kot-mockcam Virtual Device"
      });
    }
    return devices;
  };

  navigator.mediaDevices.getUserMedia = async function (constraints) {
    mountControlPanel();

    if (constraints && constraints.video) {
      if (state.mode === "real") {
        return originalGetUserMedia(constraints);
      }

      const canvasStream = state.canvas.captureStream(state.fps);
      state.activeVideoTrack = canvasStream.getVideoTracks()[0];

      if (constraints.audio) {
        try {
          const audioStream = await originalGetUserMedia({ audio: true, video: false });
          return new MediaStream([state.activeVideoTrack, audioStream.getAudioTracks()[0]]);
        } catch {
          return new MediaStream([state.activeVideoTrack]);
        }
      }
      return new MediaStream([state.activeVideoTrack]);
    }

    return originalGetUserMedia(constraints);
  };

  function scanPageVideos() {
    const vids = Array.from(document.querySelectorAll("video"));
    return vids.filter(v => v !== state.videoEl && (v.currentSrc || v.src || v.querySelector("source")?.src));
  }

  function triggerDirectDownload(sourceElement, statusBtn) {
    statusBtn.textContent = "⏳ Extracting...";

    let rawUrl = sourceElement.currentSrc || sourceElement.src;
    if (!rawUrl) {
      const sourceTag = sourceElement.querySelector("source");
      if (sourceTag) rawUrl = sourceTag.src;
    }

    if (!rawUrl) {
      statusBtn.textContent = "❌ No Source URL";
      setTimeout(() => { statusBtn.textContent = "⬇️ Direct Download"; }, 3000);
      return;
    }

    const a = document.createElement("a");
    a.href = rawUrl;
    a.download = `kot_video_${Date.now()}.mp4`;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();

    statusBtn.textContent = "✅ Download Started!";
    setTimeout(() => { statusBtn.textContent = "⬇️ Direct Download"; }, 3000);
  }

  function toggleMenuVisibility() {
    const hud = document.getElementById("__kot_mockcam_hud");
    if (!hud) {
      mountControlPanel();
      return;
    }
    hud.style.display = hud.style.display === "none" ? "block" : "none";
  }

  // Global Key Listener for Toggle Shortcut
  window.addEventListener("keydown", (e) => {
    // Skip if user is typing inside the shortcut binder input
    if (e.target && e.target.id === "__kot_hotkey_input") return;

    const s = state.shortcut;
    const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
    const altMatch = !!e.altKey === !!s.altKey;
    const ctrlMatch = !!e.ctrlKey === !!s.ctrlKey;
    const shiftMatch = !!e.shiftKey === !!s.shiftKey;

    if (keyMatch && altMatch && ctrlMatch && shiftMatch) {
      e.preventDefault();
      toggleMenuVisibility();
    }
  });

  function mountControlPanel() {
    let hud = document.getElementById("__kot_mockcam_hud");
    if (hud) {
      hud.style.display = "block";
      return;
    }

    let iconUrl = "";
    try {
      iconUrl = chrome.runtime.getURL("icon.png");
    } catch (e) {
      iconUrl = "";
    }

    hud = document.createElement("div");
    hud.id = "__kot_mockcam_hud";
    Object.assign(hud.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      width: "320px",
      backgroundColor: "#111418",
      color: "#e1e4ea",
      borderRadius: "12px",
      boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: "12px",
      zIndex: "2147483647",
      overflow: "hidden",
      userSelect: "none",
      display: "block"
    });

    hud.innerHTML = `
      <div id="__kot_header" style="padding: 10px 14px; background: #181c22; cursor: grab; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${iconUrl ? `<img src="${iconUrl}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid #10b981;" alt="Avatar" />` : `<span style="width: 10px; height: 10px; background: #10b981; border-radius: 50%;"></span>`}
          <strong style="font-size: 13px; color: #fff; letter-spacing: 0.5px;">kot-mockcam</strong>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="__kot_toggle_min" title="Minimize" style="background: none; border: none; color: #8a92a0; cursor: pointer; font-size: 16px; padding: 0 4px;">−</button>
          <button id="__kot_btn_close" title="Close (Toggle with Hotkey)" style="background: none; border: none; color: #8a92a0; cursor: pointer; font-size: 14px; padding: 0 4px;">✕</button>
        </div>
      </div>

      <div id="__kot_body" style="padding: 14px; display: flex; flex-direction: column; gap: 12px;">
        <!-- Tabs -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; background: #0c0d10; padding: 4px; border-radius: 8px;">
          <button class="kot-tab" data-mode="video" style="background: #2563eb; color: #fff; padding: 6px 0; border: none; border-radius: 6px; cursor: pointer;">Video</button>
          <button class="kot-tab" data-mode="grabbed" style="background: transparent; color: #8a92a0; padding: 6px 0; border: none; border-radius: 6px; cursor: pointer;">Grab</button>
          <button class="kot-tab" data-mode="snapshot" style="background: transparent; color: #8a92a0; padding: 6px 0; border: none; border-radius: 6px; cursor: pointer;">Snapshot</button>
          <button class="kot-tab" data-mode="real" style="background: transparent; color: #8a92a0; padding: 6px 0; border: none; border-radius: 6px; cursor: pointer;">Real</button>
        </div>

        <!-- 1. Local Video Panel -->
        <div id="__kot_video_panel" style="display: flex; flex-direction: column; gap: 8px;">
          <input type="file" id="__kot_file_video" accept="video/*" style="display: none;" />
          <button id="__kot_btn_load_video" style="width: 100%; padding: 8px; background: #1e232b; border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px; color: #cbd5e1; cursor: pointer;">
            📁 Select Local Video (.mp4 / .webm)
          </button>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button id="__kot_play_pause" style="flex: 1; padding: 6px; background: #1e232b; border: none; border-radius: 6px; color: #fff; cursor: pointer;">Pause</button>
            <button id="__kot_restart" style="padding: 6px 12px; background: #1e232b; border: none; border-radius: 6px; color: #fff; cursor: pointer;">↺</button>
          </div>
        </div>

        <!-- 2. On-Page Video Grabber Panel -->
        <div id="__kot_grab_panel" style="display: none; flex-direction: column; gap: 8px;">
          <button id="__kot_btn_scan" style="width: 100%; padding: 8px; background: #10b981; color: #000; font-weight: bold; border: none; border-radius: 6px; cursor: pointer;">
            🔍 Detect Videos on This Page
          </button>
          <div id="__kot_detected_list" style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
            <span style="color: #64748b; font-size: 11px; text-align: center;">Click Detect to find on-page videos</span>
          </div>
        </div>

        <!-- 3. Image Snapshot Panel -->
        <div id="__kot_image_panel" style="display: none; flex-direction: column; gap: 8px;">
          <input type="file" id="__kot_file_image" accept="image/*" style="display: none;" />
          <button id="__kot_btn_load_image" style="width: 100%; padding: 8px; background: #1e232b; border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px; color: #cbd5e1; cursor: pointer;">
            🖼️ Select Snapshot (.png / .jpg)
          </button>
        </div>

        <!-- Custom Controls -->
        <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label>Sensor Grain</label>
            <input id="__kot_noise" type="range" min="0" max="25" value="0" style="width: 120px;" />
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label>Brightness</label>
            <input id="__kot_brightness" type="range" min="50" max="150" value="100" style="width: 120px;" />
          </div>
          <!-- Customizable Toggle Hotkey Option -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <label style="color: #94a3b8;">Toggle Menu Key</label>
            <input id="__kot_hotkey_input" type="text" readonly value="${state.shortcut.label}" style="width: 120px; text-align: center; background: #1e232b; border: 1px solid #334155; border-radius: 4px; color: #38bdf8; padding: 4px; font-weight: bold; cursor: pointer;" title="Click and press your desired shortcut" />
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hud);

    // Draggable Window Handling
    const header = hud.querySelector("#__kot_header");
    let isDragging = false, startX, startY, initialLeft, initialTop;
    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = hud.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      hud.style.right = "auto";
      hud.style.left = `${initialLeft}px`;
      hud.style.top = `${initialTop}px`;
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      hud.style.left = `${initialLeft + (e.clientX - startX)}px`;
      hud.style.top = `${initialTop + (e.clientY - startY)}px`;
    });
    window.addEventListener("mouseup", () => { isDragging = false; });

    // Minimize & Close
    const toggleMin = hud.querySelector("#__kot_toggle_min");
    const body = hud.querySelector("#__kot_body");
    toggleMin.addEventListener("click", () => {
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "flex" : "none";
      toggleMin.textContent = isHidden ? "−" : "+";
    });

    hud.querySelector("#__kot_btn_close").addEventListener("click", () => {
      hud.style.display = "none";
    });

    // Custom Keybinding Input Logic
    const hotkeyInput = hud.querySelector("#__kot_hotkey_input");
    hotkeyInput.addEventListener("keydown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore pure modifier presses
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

      const keys = [];
      if (e.ctrlKey) keys.push("Ctrl");
      if (e.altKey) keys.push("Alt");
      if (e.shiftKey) keys.push("Shift");
      keys.push(e.key.toUpperCase());

      const label = keys.join(" + ");
      state.shortcut = {
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        key: e.key,
        label: label
      };

      localStorage.setItem("__kot_mockcam_shortcut", JSON.stringify(state.shortcut));
      hotkeyInput.value = label;
      hotkeyInput.blur();
    });

    // Tab Switching
    const tabs = hud.querySelectorAll(".kot-tab");
    const videoPanel = hud.querySelector("#__kot_video_panel");
    const grabPanel = hud.querySelector("#__kot_grab_panel");
    const imagePanel = hud.querySelector("#__kot_image_panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          t.style.background = "transparent";
          t.style.color = "#8a92a0";
        });
        tab.style.background = "#2563eb";
        tab.style.color = "#fff";

        state.mode = tab.dataset.mode;
        videoPanel.style.display = state.mode === "video" ? "flex" : "none";
        grabPanel.style.display = state.mode === "grabbed" ? "flex" : "none";
        imagePanel.style.display = state.mode === "snapshot" ? "flex" : "none";
      });
    });

    // Local Video Events
    const vidFileInput = hud.querySelector("#__kot_file_video");
    const loadVidBtn = hud.querySelector("#__kot_btn_load_video");
    loadVidBtn.addEventListener("click", () => vidFileInput.click());
    vidFileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) {
        state.videoEl.src = URL.createObjectURL(e.target.files[0]);
        state.videoEl.play();
        loadVidBtn.textContent = `📹 ${e.target.files[0].name.slice(0, 16)}...`;
      }
    });

    hud.querySelector("#__kot_play_pause").addEventListener("click", (e) => {
      const vid = state.mode === "grabbed" && state.targetPageVideo ? state.targetPageVideo : state.videoEl;
      if (vid.paused) {
        vid.play();
        e.target.textContent = "Pause";
      } else {
        vid.pause();
        e.target.textContent = "Play";
      }
    });

    hud.querySelector("#__kot_restart").addEventListener("click", () => {
      const vid = state.mode === "grabbed" && state.targetPageVideo ? state.targetPageVideo : state.videoEl;
      vid.currentTime = 0;
      vid.play();
    });

    // Scanner
    const scanBtn = hud.querySelector("#__kot_btn_scan");
    const detectedList = hud.querySelector("#__kot_detected_list");

    scanBtn.addEventListener("click", () => {
      const videos = scanPageVideos();
      detectedList.innerHTML = "";

      if (videos.length === 0) {
        detectedList.innerHTML = `<span style="color:#ef4444; font-size:11px; text-align:center;">No active videos detected. Play the video first!</span>`;
        return;
      }

      videos.forEach((vid, index) => {
        const item = document.createElement("div");
        Object.assign(item.style, {
          background: "#1e232b",
          padding: "8px",
          borderRadius: "6px",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        });

        item.innerHTML = `
          <span style="font-weight: 600; color: #fff;">Video #${index + 1} (${vid.videoWidth || '?'}x${vid.videoHeight || '?'})</span>
          <div style="display: flex; gap: 6px;">
            <button class="kot-use-cam" style="flex: 1; padding: 5px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🎥 Use as Cam</button>
            <button class="kot-dl-btn" style="flex: 1; padding: 5px; background: #334155; color: #fff; border: none; border-radius: 4px; cursor: pointer;">⬇️ Direct Download</button>
          </div>
        `;

        item.querySelector(".kot-use-cam").addEventListener("click", () => {
          state.targetPageVideo = vid;
          state.mode = "grabbed";
          tabs.forEach(t => {
            t.style.background = t.dataset.mode === "grabbed" ? "#2563eb" : "transparent";
            t.style.color = t.dataset.mode === "grabbed" ? "#fff" : "#8a92a0";
          });
        });

        const dlBtn = item.querySelector(".kot-dl-btn");
        dlBtn.addEventListener("click", () => {
          triggerDirectDownload(vid, dlBtn);
        });

        detectedList.appendChild(item);
      });
    });

    // Snapshot Selector
    const imgFileInput = hud.querySelector("#__kot_file_image");
    const loadImgBtn = hud.querySelector("#__kot_btn_load_image");
    loadImgBtn.addEventListener("click", () => imgFileInput.click());
    imgFileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) {
        state.imageEl.src = URL.createObjectURL(e.target.files[0]);
        loadImgBtn.textContent = `🖼️ ${e.target.files[0].name.slice(0, 16)}...`;
      }
    });

    // Sliders
    hud.querySelector("#__kot_noise").addEventListener("input", (e) => {
      state.noise = parseFloat(e.target.value);
    });
    hud.querySelector("#__kot_brightness").addEventListener("input", (e) => {
      state.brightness = parseFloat(e.target.value);
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    mountControlPanel();
  } else {
    window.addEventListener("DOMContentLoaded", mountControlPanel);
  }
})();