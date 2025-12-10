(() => {
  "use strict";

  // 固定デフォルト（将来設定で変更可能に）
  const WORK_MINUTES_DEFAULT = 25;
  const BREAK_MINUTES_DEFAULT = 5;

  // DOM 参照
  const phaseLabel = document.getElementById("phaseLabel");
  const timeDisplay = document.getElementById("timeDisplay");
  const startPauseBtn = document.getElementById("startPauseBtn");
  const resetBtn = document.getElementById("resetBtn");
  const presetContainer = document.querySelector(".preset");
  const purposeSelect = document.getElementById("purposeSelect");
  const noteInput = document.getElementById("noteInput");

  const imageInput = document.getElementById("imageInput");
  const imagePreview = document.getElementById("imagePreview");
  const clearImageBtn = document.getElementById("clearImageBtn");
  const imageCountLabel = document.getElementById("imageCountLabel");

  // 状態
  const Phase = {
    Work: "work",
    Break: "break",
    Stopped: "stopped",
  };

  let currentPhase = Phase.Work;
  let isRunning = false;
  let remainingSeconds = WORK_MINUTES_DEFAULT * 60;
  let intervalId = null;
  let hasSwitchedToBreak = false; // 作業→休憩の一度だけ自動切替
  let usePomodoroMode = true; // true: 25+5、false: 単発（3分/5分など）

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateDisplay() {
    timeDisplay.textContent = formatTime(remainingSeconds);
    switch (currentPhase) {
      case Phase.Work:
        phaseLabel.textContent = "作業中";
        phaseLabel.style.color = "#28d7a5";
        break;
      case Phase.Break:
        phaseLabel.textContent = "休憩中";
        phaseLabel.style.color = "#5b8cff";
        break;
      default:
        phaseLabel.textContent = "停止中";
        phaseLabel.style.color = "#9aa4b2";
        break;
    }
    startPauseBtn.textContent = isRunning ? "一時停止" : "スタート";
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    const targetEpochMs = Date.now() + remainingSeconds * 1000;
    const startedAtIso = new Date().toISOString();
    startSlideshow();
    intervalId = setInterval(() => {
      const diff = Math.max(0, Math.round((targetEpochMs - Date.now()) / 1000));
      remainingSeconds = diff;
      updateDisplay();
      if (diff <= 0) {
        clearInterval(intervalId);
        intervalId = null;
        isRunning = false;
        playBeep();

        // 作業→休憩へは自動で一度だけ切替。その後は停止。
        if (!hasSwitchedToBreak && currentPhase === Phase.Work && usePomodoroMode) {
          hasSwitchedToBreak = true;
          switchToBreak();
          startTimer();
        } else {
          const endedAtIso = new Date().toISOString();
          // 作業完了 or 単発タイマー完了時にNotionへログ
          if (currentPhase === Phase.Work || !usePomodoroMode) {
            sendNotionLog({ startedAtIso, endedAtIso });
          }
          stopSlideshow();
          currentPhase = Phase.Stopped;
          updateDisplay();
        }
      }
    }, 250);
    updateDisplay();
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    stopSlideshow();
    updateDisplay();
  }

  function resetTimer() {
    pauseTimer();
    currentPhase = usePomodoroMode ? Phase.Work : Phase.Stopped;
    hasSwitchedToBreak = false;
    remainingSeconds = usePomodoroMode ? (WORK_MINUTES_DEFAULT * 60) : remainingSeconds;
    updateDisplay();
  }

  function switchToBreak() {
    currentPhase = Phase.Break;
    remainingSeconds = BREAK_MINUTES_DEFAULT * 60;
    updateDisplay();
  }

  // アラーム時計風の連打トーン
  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = 0.39; // 全体音量（130%相当）
      master.connect(ctx.destination);

      // 2トーンを小刻みに繰り返す（目覚ましっぽい）
      // 1サイクル: 1400Hz(90ms) → 1000Hz(90ms) → 休み(60ms)
      // これを4サイクル再生し、そのブロックを3回繰り返す
      const cycles = 4; // 1ブロック内のトーン回数
      const repeats = 3; // ブロックの繰り返し回数
      const repeatGap = 0.25; // ブロック間の休止秒
      const toneAHz = 1400;
      const toneBHz = 1000;
      const toneDur = 0.09; // 秒
      const gapDur = 0.06; // 秒（サイクル内の小休止）

      let t = ctx.currentTime;
      for (let r = 0; r < repeats; r++) {
        for (let i = 0; i < cycles; i++) {
          // 高音
          scheduleTone(ctx, master, toneAHz, t, toneDur);
          t += toneDur;
          // 低音
          scheduleTone(ctx, master, toneBHz, t, toneDur);
          t += toneDur + gapDur;
        }
        if (r < repeats - 1) {
          t += repeatGap; // ブロック間の小休止
        }
      }

      // 自動終了用の無音オシレータ（Safari対策で解放）
      const endAt = t + 0.02;
      const dummy = ctx.createOscillator();
      dummy.connect(master);
      dummy.start(endAt - 0.01);
      dummy.stop(endAt);

      // 音声読み上げ「終了しました」
      setTimeout(() => {
        try {
          const utterance = new SpeechSynthesisUtterance("終了しました");
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          utterance.volume = 0.8;
          speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("音声読み上げに失敗しました", e);
        }
      }, 1000); // アラーム音の後に再生

      function scheduleTone(ctx, destination, freq, startAt, durationSec) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle"; // 少しベルっぽい
        osc.frequency.setValueAtTime(freq, startAt);
        // 立ち上がり/減衰でクリック音を抑える
        g.gain.setValueAtTime(0.0001, startAt);
        g.gain.exponentialRampToValueAtTime(1.0, startAt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
        osc.connect(g);
        g.connect(destination);
        osc.start(startAt);
        osc.stop(startAt + durationSec + 0.02);
      }
    } catch (e) {
      console.warn("音声の再生に失敗しました", e);
    }
  }

  // 画像保存：localStorage に DataURL を保存
  const IMAGE_KEY = "pomodoro.background.image"; // 旧キー（単一）
  const IMAGES_KEY = "pomodoro.background.images"; // 新キー（配列）
  let imagesArray = []; // DataURLの配列
  let slideshowTimerId = null;

  function loadImageFromStorage() {
    const multi = localStorage.getItem(IMAGES_KEY);
    if (multi) {
      try {
        imagesArray = JSON.parse(multi);
      } catch {
        imagesArray = [];
      }
    } else {
      // 後方互換：旧キーがあれば取り込んで配列化
      const legacy = localStorage.getItem(IMAGE_KEY);
      imagesArray = legacy ? [legacy] : [];
    }
    renderPreviewCurrent();
    updateImageCount();
  }

  function renderPreviewCurrent() {
    imagePreview.innerHTML = "";
    if (!imagesArray || imagesArray.length === 0) {
      const span = document.createElement("span");
      span.className = "media__placeholder";
      span.textContent = "画像が未設定です";
      imagePreview.appendChild(span);
      return;
    }
    const idx = Math.floor(Math.random() * imagesArray.length);
    const img = document.createElement("img");
    img.alt = "選択画像プレビュー";
    img.src = imagesArray[idx];
    imagePreview.appendChild(img);
  }

  function updateImageCount() {
    if (imageCountLabel) imageCountLabel.textContent = String(imagesArray.length);
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 画像圧縮（PNG/JPEG用）。最大辺1280px、品質0.8。GIFは圧縮せず、サイズ制限で判定。
  async function compressImageFile(file) {
    const isGif = /gif$/i.test(file.type) || /\.gif$/i.test(file.name);
    if (isGif) {
      // アニメGIFはそのまま保持。サイズ上限を設ける（~1.5MB）
      if (file.size > 1_500_000) {
        throw new Error("GIFが大きすぎます（1.5MB超）");
      }
      return await fileToDataUrl(file);
    }

    // 画像を読み込んでCanvasで縮小
    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
    const image = /** @type {HTMLImageElement} */ (img);
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
    const targetW = Math.max(1, Math.round(image.width * scale));
    const targetH = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, targetW, targetH);

    // JPEGで書き出し（品質0.8）。元PNGでも容量優先でJPEG化
    const out = canvas.toDataURL("image/jpeg", 0.8);
    return out;
  }

  function safeSaveImagesArray() {
    // 容量オーバー対策：古いものから削って保存を試みる
    try {
      localStorage.setItem(IMAGES_KEY, JSON.stringify(imagesArray));
      return { removed: 0 };
    } catch (e) {
      let removed = 0;
      while (imagesArray.length > 0) {
        imagesArray.shift();
        removed++;
        try {
          localStorage.setItem(IMAGES_KEY, JSON.stringify(imagesArray));
          return { removed };
        } catch (_) {
          // 続行
        }
      }
      return { removed };
    }
  }

  function startSlideshow() {
    stopSlideshow();
    if (!imagesArray || imagesArray.length === 0) return;
    // 1分ごとにランダム切替
    slideshowTimerId = setInterval(() => {
      renderPreviewCurrent();
    }, 60000);
  }

  function stopSlideshow() {
    if (slideshowTimerId) {
      clearInterval(slideshowTimerId);
      slideshowTimerId = null;
    }
  }

  // イベント
  if (presetContainer) {
    presetContainer.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const preset = target.getAttribute("data-preset");
      if (!preset) return;

      pauseTimer();
      hasSwitchedToBreak = false;

      if (preset === "3") {
        usePomodoroMode = false;
        currentPhase = Phase.Stopped;
        remainingSeconds = 3 * 60;
      } else if (preset === "5") {
        usePomodoroMode = false;
        currentPhase = Phase.Stopped;
        remainingSeconds = 5 * 60;
      } else if (preset === "25-5") {
        usePomodoroMode = true;
        currentPhase = Phase.Work;
        remainingSeconds = WORK_MINUTES_DEFAULT * 60;
      }
      updateDisplay();
    });
  }
  startPauseBtn.addEventListener("click", () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener("click", () => {
    resetTimer();
  });

  imageInput.addEventListener("change", async () => {
    const files = imageInput.files;
    if (!files || files.length === 0) return;
    try {
      const results = [];
      for (const f of Array.from(files)) {
        try {
          const d = await compressImageFile(f);
          results.push(d);
        } catch (e) {
          console.warn("スキップ:", f.name, e);
          alert(`画像をスキップしました: ${f.name} (${e?.message || e})`);
        }
      }
      imagesArray = imagesArray.concat(results);
      const { removed } = safeSaveImagesArray();
      if (removed > 0) {
        alert(`保存容量の都合で、古い画像を${removed}枚削除しました。`);
      }
      renderPreviewCurrent();
      updateImageCount();
      imageInput.value = "";
    } catch (e) {
      console.error("画像の読み込みに失敗しました", e);
      alert("画像の読み込みに失敗しました。");
    }
  });

  clearImageBtn.addEventListener("click", () => {
    localStorage.removeItem(IMAGE_KEY);
    localStorage.removeItem(IMAGES_KEY);
    imagesArray = [];
    renderPreviewCurrent();
    updateImageCount();
  });

  // 初期化
  updateDisplay();
  loadImageFromStorage();

  // Notion送信
  async function sendNotionLog({ startedAtIso, endedAtIso }) {
    try {
      const purpose = purposeSelect ? purposeSelect.value : "";
      const note = noteInput ? noteInput.value : "";
      const title = formatLocalDateForTitle(new Date(startedAtIso));
      
      console.log("Notion送信開始:", { title, start: startedAtIso, end: endedAtIso, purpose, note });
      
      const res = await fetch("http://localhost:8787/notion/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: startedAtIso,
          end: endedAtIso,
          purpose,
          note,
        }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.warn("Notion送信失敗:", res.status, text);
      } else {
        const result = await res.json();
        console.log("Notion送信成功:", result);
      }
    } catch (e) {
      console.warn("Notion送信エラー", e);
    }
  }

  function formatLocalDateForTitle(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }
})();


