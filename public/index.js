"use strict";

const LANG = navigator.language || "fr-FR"; // Langue dÃ©tectÃ©e automatiquement.
const WORD_DELAY_MS = 500;
const FADE_MS = 100;

const devLog = [];
const rawLog = console.log.bind(console);
console.log = function() {
    let line = "";
    try {
      line = Array.from(arguments).map(a => {
        if (a == null) return String(a);
        if (typeof a === "object") {
          const m = a.message != null ? a.message : (a.stack ? a.stack.split("\n")[0] : "");
          return m || JSON.stringify(a).slice(0, 200);
        }
        return String(a);
      }).join(" ");
      devLog.push(line);
      if (devLog.length > 300) devLog.shift();
      try { localStorage.setItem("samaritain.log", devLog.slice(-80).join("\n")); } catch (e) {}
    } catch (e) {}
    rawLog.apply(null, arguments);
  };
  window.addEventListener("error", (e) => { console.log("[script] " + e.message); });
  window.addEventListener("unhandledrejection", (e) => { console.log("[rejection] " + String(e.reason)); });

const textEl = document.getElementById("text");
const barEl = document.getElementById("bar");
const bodyEl = document.body;
const panelEl       = document.getElementById("panel");
const modelNameEl   = document.getElementById("modelName");
const mainEl        = document.getElementById("main");
const markerEl      = document.getElementById("marker");
const dotsEl        = document.querySelector("#marker .dots");
const triangleEl    = document.getElementById("triangle");
const statusEl      = document.getElementById("status");
const statusLabelEl = document.querySelector("#status .label");

  let recognition = null;
  let isBusy = false;
  let statusHideTimer = null;
  let lastTranscript = "";
  let audioPrimed = false;
  let retryIndex = 0;
  const RETRY_DELAYS = [300, 1000, 2000, 3500];

function measureTextWidth(text) {
    const cs = getComputedStyle(textEl);
    const span = document.createElement("span");
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.textTransform = cs.textTransform;
    span.style.letterSpacing = cs.letterSpacing;
    span.textContent = text;
    document.body.appendChild(span);
    const w = span.getBoundingClientRect().width;
    span.remove();
    return w;
}

  function setText(str) {
    const has = !!(str && str.length);
    textEl.textContent = has ? str : "\u00A0";
    textEl.classList.toggle("hidden", !has);
    barEl.style.width = (has ? Math.min(measureTextWidth(str), mainEl.clientWidth) : 30) + "px";
  }

  function setMode(mode) {
    bodyEl.classList.remove("listening", "thinking");
    if (mode === "listening") bodyEl.classList.add("listening");
    if (mode === "thinking") bodyEl.classList.add("thinking");
  }

  function showStatus(txt) {
    if (statusHideTimer) { clearTimeout(statusHideTimer); statusHideTimer = null; }
    statusEl.classList.remove("show", "hide");
    statusLabelEl.textContent = txt;
    void statusEl.offsetWidth;
    statusEl.classList.add("show");
  }
  function showThinkingStatus() {
    if (statusHideTimer) { clearTimeout(statusHideTimer); statusHideTimer = null; }
    if (dotsEl) dotsEl.hidden = false;
    textEl.classList.remove("hidden");
    textEl.textContent = "calculating response";
    barEl.style.width = Math.min(measureTextWidth(textEl.textContent), mainEl.clientWidth) + "px";
    playWordAnim("word-in");
  }
  function hideStatus() {
    if (dotsEl) dotsEl.hidden = true;
    if (!statusEl.classList.contains("show")) return;
    statusEl.classList.add("hide");
    if (statusHideTimer) clearTimeout(statusHideTimer);
    statusHideTimer = setTimeout(() => {
      statusHideTimer = null;
      statusEl.classList.remove("show", "hide");
    }, 500);
  }

  function flashStatus(txt, ms) {
    showStatus(txt);
    if (statusHideTimer) clearTimeout(statusHideTimer);
    statusHideTimer = setTimeout(hideStatus, ms || 2500);
  }

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  function playWordAnim(cls) {
    textEl.classList.remove("word-in", "word-out");
    void textEl.offsetWidth;
    textEl.classList.add(cls);
  }

  let streamTimer = null;
  let streamQueue = [];
  let streamIndex = 0;
  let streamStarted = false;
  let lastWordCount = 0;
  function playStreamedWords(trimmed) {
    const words = trimmed.replace(/[^\p{L}\p{N}\s]/gu).split(/\s+/).filter(Boolean);
    const newWords = words.slice(lastWordCount);
    lastWordCount = words.length;
    if (newWords.length === 0) return;
    if (!streamStarted) {
      streamStarted = true;
      if (dotsEl) dotsEl.hidden = true;
    }
    for (const word of newWords) {
      streamQueue.push(word);
    }
    if (streamTimer) return;
    const step = () => {
      if (streamIndex >= streamQueue.length) {
        streamTimer = null;
        return;
      }
      const word = streamQueue[streamIndex++];
      textEl.classList.remove("hidden");
      textEl.textContent = word;
      barEl.style.width = Math.min(measureTextWidth(word), 50) + "px";
      playWordAnim("word-in");
      streamTimer = setTimeout(step, WORD_DELAY_MS);
    };
    streamTimer = setTimeout(step, 0);
  }
  function finishStreamedWords() {
    return new Promise(resolve => {
      const check = () => {
        if (!streamTimer && streamIndex >= streamQueue.length) {
          textEl.textContent = "\u00A0";
          if (dotsEl) dotsEl.hidden = true;
          textEl.classList.add("hidden");
          barEl.style.width = "30px";
          resolve();
        } else {
          setTimeout(check, 80);
        }
      };
      check();
    });
  }

  async function speakWords(fullText) {
    const words = fullText.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      textEl.classList.remove("hidden");
      if (dotsEl) dotsEl.hidden = true;
      textEl.textContent = words[i];
      barEl.style.width = Math.min(measureTextWidth(words[i]), mainEl.clientWidth) + "px";
      playWordAnim("word-in");
      await sleep(WORD_DELAY_MS);
      if (i < words.length - 1) {
        playWordAnim("word-out");
        await sleep(FADE_MS);
        textEl.textContent = "\u00A0";
      }
    }
  }

  // ---------- FAUX LOADER (cosmÃ©tique) ----------
  // Ne charge rien de rÃ©el â€” c'est juste l'habillage visuel d'origine, rejouÃ©
  // sur une durÃ©e fixe minutÃ©e, sans lien avec un tÃ©lÃ©chargement ou un modÃ¨le.
  const loaderEl        = document.getElementById("loader");
  const bootLogEl       = document.getElementById("boot-log");
  const loadingPaneEl   = document.getElementById("loading-pane-container");
  const loadingNameEl   = document.getElementById("loading-name");
  const loadingBarEl    = document.getElementById("loading-bar");
  const connectedEl     = document.getElementById("loading-connected");
  const connectedTextEl = document.getElementById("loading-connected-text");

  const SYS_TOKENS = [
    "x0.0/sirv", "+0.1/ecom", "[eth0]", "[eth1]",
    "feed_1 [ ]", "feed_2 [ ]", "feed_3 [ ]", "feed_4 [ ]", "feed_5 [ ]",
    "feed_6 [ ]", "feed_7 [ ]", "feed_8 [ ]", "feed_9 [ ]"
  ];
  const RESOURCE_SEGMENTS = [
	"resources.comm.archive",	"resources.im.users", "resources.im.log",
	"resources.rin-im",	"resources.email.users", "resources.email.data",
	"resources.voip",	"resources.dsn-messaging", "resources.dsn-subscribers",
	"resources.web.users", "resources.web.content",	"resources.video.feeds",
	"resources.video.archive",	"linking.databases.sigint.xxx-",	"linking.databases.sigint.xxx-100",
	"linking.databases.sigint.xxx-140",	"linking.databases.sigint.xxx-154",	"linking.databases.sigint.xxx-194",
	"linking.databases.sigint.xxx-207",	"linking.databases.sigint.xxx-248",	"linking.databases.sigint.xxx-274",
	"linking.databases.sigint.xxx-301",	"linking.databases.sigint.xxx-342",	"linking.databases.sigint.xxx-400",
	"linking.databases.sigint.xxx-449",	"linking.databases.sigint.xxx-560",	"linking.databases.sigint.xxx-631",
	"linking.databases.sigint.xxx-798",	"linking.databases.sigint.xxx-830",	"linking.databases.sigint.xxx-904",
	"linking.databases.sigint.xxx-999"];

  function randomResourceName() {
    const seg = RESOURCE_SEGMENTS[Math.floor(Math.random() * RESOURCE_SEGMENTS.length)];
    const r = Math.random();
    if (r < 0.3) return seg + ".xxx-" + Math.floor(Math.random() * 1000);
    if (r < 0.55) return seg + "." + Math.floor(100 + Math.random() * 900);
    if (r < 0.7) return seg + "-" + String(Math.floor(Math.random() * 100)).padStart(2, "0");
    return seg;
  }
  function randomBootLine() {
    if (Math.random() < 0.3) return SYS_TOKENS[Math.floor(Math.random() * SYS_TOKENS.length)];
    return randomResourceName();
  }

  let logLineCount = 0;
  const STREAM_MAX_LINES = 60;
  const TYPE_INTERVAL = 16;
  let typeTimer = null;
  let pendingText = "";
  let activeLine = null;

  function bootLinePrefix(idx) {
    return "<b style=\"color:#F00\">[[</b>"
      + (idx < 10 ? " x0" : "x") + idx
      + (idx < 10 ? " " : "")
      + "<b style=\"color:#F00\">]</b> ";
  }
  function appendBootLine(line) {
    const span = document.createElement("span");
    span.className = "boot-line";
    span.innerHTML = bootLinePrefix(logLineCount++) + "<span class=\"boot-text\">" + line + "</span>";
    bootLogEl.appendChild(span);
    pruneBootLog();
    bootLogEl.scrollTop = bootLogEl.scrollHeight;
  }
  function startBootLine() {
    activeLine = document.createElement("span");
    activeLine.className = "boot-line";
    activeLine.innerHTML = bootLinePrefix(logLineCount++) + "<span class=\"boot-text\"></span>";
    const cursor = bootLogEl.querySelector(".boot-cursor");
    if (cursor) bootLogEl.insertBefore(activeLine, cursor);
    else bootLogEl.appendChild(activeLine);
    pendingText = randomBootLine();
  }
  function typeNextChar() {
    if (!activeLine) startBootLine();
    if (pendingText) {
      const ch = pendingText.charAt(0);
      pendingText = pendingText.slice(1);
      const text = activeLine.querySelector(".boot-text");
      if (text) text.textContent += ch;
    } else {
      activeLine = null;
      startBootLine();
    }
    pruneBootLog();
    bootLogEl.scrollTop = bootLogEl.scrollHeight;
  }
  function pruneBootLog() {
    while (bootLogEl.querySelectorAll(".boot-line").length > STREAM_MAX_LINES) {
      const first = bootLogEl.querySelector(".boot-line");
      if (first) bootLogEl.removeChild(first);
    }
  }
  function startResourceStream() {
    stopResourceStream();
    bootLogEl.innerHTML = "";
    logLineCount = 0;
    activeLine = null;
    pendingText = "";
    const cursor = document.createElement("span");
    cursor.className = "boot-cursor";
    bootLogEl.appendChild(cursor);
    typeTimer = setInterval(typeNextChar, TYPE_INTERVAL);
  }
  function stopResourceStream() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
  }

  function bootLoader() {
    stopResourceStream();
    loaderEl.classList.remove("open", "done", "finishing");
    bootLogEl.innerHTML = "";
    logLineCount = 0;
    setLoaderProgressNow(0);
    loadingNameEl.textContent = "initialisation...";
    connectedEl.style.display = "none";
    connectedEl.classList.remove("show", "hide", "error");
    loadingPaneEl.style.opacity = "";
    loaderEl.style.display = "flex";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => loaderEl.classList.add("open"));
    });
    startResourceStream();
  }
  // La barre est animÃ©e par interpolation, pas par sauts : chaque ressource ne
  // fait que fixer une nouvelle cible, et une boucle requestAnimationFrame
  // rapproche la largeur de cette cible Ã  vitesse constante. Sans Ã§a, un dÃ©lai
  // de 600 ms puis un de 140 ms donnaient deux bonds secs, trÃ¨s visibles.
  let targetPct = 0;
  let shownPct = 0;
  let easeFrame = 0;
  function setLoaderProgress(pct) {
    targetPct = Math.min(100, Math.max(0, pct));
    if (easeFrame) return;
    const speed = Math.max(0.35, Math.min(2.2, (targetPct - shownPct) / 12));
    easeFrame = requestAnimationFrame(function ease() {
      const diff = targetPct - shownPct;
      // Asymptotique : la barre s'approche de la cible sans jamais l'atteindre
      // brutalement, ce qui supprime tout Ã -coup.
      shownPct += diff * 0.12 * speed;
      if (Math.abs(diff) < 0.15) {
        shownPct = targetPct;
        easeFrame = 0;
      } else {
        easeFrame = requestAnimationFrame(ease);
      }
      loadingBarEl.style.width = shownPct.toFixed(2) + "%";
    });
  }
  function setLoaderProgressNow(pct) {
    targetPct = shownPct = Math.min(100, Math.max(0, pct));
    loadingBarEl.style.width = shownPct + "%";
  }
  function showResourceName(name) {
    loadingNameEl.textContent = name;
  }
  async function dismissLoader(fast) {
    connectedEl.classList.remove("show");
    connectedEl.classList.add("hide");
    await sleep(fast ? 150 : 500);
    connectedEl.classList.remove("hide", "error");
    loaderEl.classList.add("done");
    await sleep(fast ? 450 : 1200);
    loaderEl.style.display = "none";
    loaderEl.classList.remove("open", "done", "finishing");
  }
  async function finishLoader(fast) {
    stopResourceStream();
    stopFakeTimer();
    const cursor = bootLogEl.querySelector(".boot-cursor");
    if (cursor) cursor.remove();
    for (let i = 0; i < 6; i++) appendBootLine(randomBootLine());
    setLoaderProgressNow(100);
    loaderEl.classList.add("finishing");
    connectedEl.style.display = "block";
    connectedTextEl.textContent = "connection established";
    connectedEl.classList.add("show");
    await sleep(fast ? 600 : 1400);
    await dismissLoader(fast);
  }

  function runProgress(durationMs) {
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / durationMs);
        setLoaderProgress(t * 100);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  // Le loader est dÃ©sormais une simulation : plus aucun modÃ¨le local Ã 
  // tÃ©lÃ©charger. On parcourt une liste de ressources fictives, chacune avec un
  // Delais randomises, pour que la sequence ne soit jamais identique d'un
  // lancement a l'autre.
  const FAKE_MIN_MS = 280;
  const FAKE_MAX_MS = 1240;
  let fakeTimer = null;
  function stopFakeTimer() {
    if (fakeTimer) { clearTimeout(fakeTimer); fakeTimer = null; }
  }
  function randomDelay() {
    return FAKE_MIN_MS + Math.floor(Math.random() * (FAKE_MAX_MS - FAKE_MIN_MS));
  }
  // MÃ©lange la liste pour que l'ordre des ressources change Ã  chaque run, avec
  // un dÃ©calage alÃ©atoire sur les dÃ©lais.
  function buildFakeSteps() {
    const steps = RESOURCE_SEGMENTS.slice();
    for (let i = steps.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = steps[i];
      steps[i] = steps[j];
      steps[j] = t;
    }
    return steps.slice(0, 24).map(name => ({ name: name, delay: randomDelay() }));
  }
  function runFakeLoader(steps, onDone) {
    let i = 0;
    const total = steps.length;
    const totalDelay = steps.reduce((a, s) => a + s.delay, 0);
    let elapsed = 0;
    function step() {
      if (i >= total) {
        setLoaderProgress(100);
        // On laisse la barre rejoindre 100 % avant de conclure, sinon elle est
        // coupÃ©e en cours de route.
        setTimeout(onDone, 420);
        return;
      }
      const s = steps[i++];
      elapsed += s.delay;
      // La cible avance par paliers egaux, l'interpolation fait le reste.
      setLoaderProgress((elapsed / totalDelay) * 100);
      showResourceName(s.name);
      fakeTimer = setTimeout(step, s.delay);
    }
    step();
  }
  async function playFakeLoader() {
    bootLoader();
    const steps = buildFakeSteps();
    console.log("[info] " + ["[loader] simulation, " + steps.length + " ressources"].join(" "));
    await new Promise(resolve => {
      runFakeLoader(steps, () => { stopFakeTimer(); resolve(); });
    });
    await finishLoader(false);
    return true;
  }
  async function replayLoader() {
    await playFakeLoader();
  }

  function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showStatus("Reconnaissance vocale non supportÃ©e");
      return null;
    }
    const rec = new SpeechRecognition();
    rec.lang = LANG;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const SILENCE_MS = 1600;
    const TOTAL_MS   = 8000;
    let silenceTimer = null;
    let totalTimer   = null;

    function stopRec() {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (totalTimer)   { clearTimeout(totalTimer);   totalTimer = null; }
      try { rec.stop(); } catch (e) {}
    }

    rec.onstart = () => {
      isBusy = true;
      lastTranscript = "";
      setMode("listening");
      setText("");
      console.log("[info] " + ["[stt] start"].join(" "));
      if (silenceTimer) clearTimeout(silenceTimer);
      if (totalTimer) clearTimeout(totalTimer);
      totalTimer = setTimeout(() => {
        console.log("[warn] " + ["[stt] timeout total"].join(" "));
        stopRec();
      }, TOTAL_MS);
    };

    rec.onresult = (event) => {
      let text = "";
      try {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            lastTranscript = res[0].transcript.trim();
            console.log("[info] " + ["[stt] final=" + lastTranscript].join(" "));
          } else {
            text += res[0].transcript;
          }
        }
      } catch (e) {
        console.log("[warn] " + ["[stt] result absent", e].join(" "));
      }

      if (lastTranscript) {
        setText(lastTranscript);
        retryIndex = 0;
        console.log("[info] " + ["[stt] fin au rÃ©sultat final"].join(" "));
        stopRec();
      } else {
        text = text.trim();
        if (text) setText(text);
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          console.log("[info] " + ["[stt] fin par silence"].join(" "));
          stopRec();
        }, SILENCE_MS);
      }
    };

    rec.onerror = (e) => {
      console.log("[warn] " + ["[stt] error=" + (e && e.error)].join(" "));
      stopRec();
      isBusy = false;
      lastTranscript = "";
      setMode("");
      setText("");
    };

    rec.onend = async () => {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (totalTimer) { clearTimeout(totalTimer); totalTimer = null; }
      const transcript = lastTranscript || textEl.textContent.trim();
      lastTranscript = "";
      console.log("[info] " + ["[stt] onend transcript='" + transcript + "'"].join(" "));
      if (transcript) {
        await queryModel(transcript);
      } else {
        setMode("");
        setText("");
        isBusy = false;
        if (retryIndex < RETRY_DELAYS.length) {
          const d = RETRY_DELAYS[retryIndex];
          retryIndex++;
          console.log("[warn] " + ["[stt] rien entendu, retry dans " + d + " ms"].join(" "));
          setTimeout(() => { startListening(true); }, d);
        } else {
          retryIndex = 0;
          flashStatus("je n'ai rien entendu");
        }
      }
    };

    return rec;
  }

  async function primeAudio() {
    if (audioPrimed) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        audioPrimed = true;
        return;
      }
      await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          stream.getTracks().forEach(t => t.stop());
          audioPrimed = true;
          console.log("[info] " + ["[stt] micro primÃ©"].join(" "));
        }),
        sleep(1500)
      ]);
    } catch (e) {
      console.log("[warn] " + ["[stt] prime micro refusÃ©e", e].join(" "));
    }
  }

  async function startListening(auto = false) {
    if (isBusy) {
      console.log("[warn] " + ["[stt] bloquÃ©: occupation"].join(" "));
      return;
    }
    if (!auto) retryIndex = 0;
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;
    await primeAudio();
    try { recognition.start(); } catch (e) { console.log("[warn] " + ["[stt] start throw", e].join(" ")); }
  }

  function describeError(e) {
    if (e == null) return String(e);
    if (typeof e === "object") {
      const msg = (e.name ? e.name + ": " : "") + (e.message != null ? e.message : "") + (e.cause ? " cause=" + describeError(e.cause) : "");
      return msg + (e.stack ? " | " + e.stack.split("\n").slice(0, 3).join(" | ") : "");
    }
    return String(e);
  }

// ---------- FOURNISSEURS API ----------
  const CONFIG_KEY = "samaritain.config";
  const gateEl = document.getElementById("gate");
  const gateLogEl = document.getElementById("gateLog");
  const gateProvidersEl = document.getElementById("gateProviders");
  const gateFormEl = document.getElementById("gateForm");
  // Le champ modele est un <input list> et non un <select> : c'est la seule
  // facon native de filtrer une liste de plusieurs centaines d'entrees. Les
  // <option> vivent dans le <datalist>, le champ affiche et stocke le texte.
  const gateModelSel = document.getElementById("gateModel");
  const gateModelListEl = document.getElementById("gateModelList");
  const gateModelCountEl = document.getElementById("gateModelCount");
  const gateKeyInput = document.getElementById("gateKey");
  const gateKeyStateEl = document.getElementById("gateKeyState");
  const gateKeyLinkEl = document.getElementById("gateKeyLink");
  const gateSubmitEl = document.getElementById("gateSubmit");
  const changeProviderBtn = document.getElementById("changeProviderBtn");

  let currentProviderId = "openai";
  let config = { provider: "openai", model: "", apiKey: "" };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && PROVIDERS[saved.provider]) {
          config = {
            provider: saved.provider,
            model: String(saved.model || ""),
            apiKey: String(saved.apiKey || "")
          };
        }
      }
    } catch (e) {}
    currentProviderId = config.provider;
  }
  function saveConfig() {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (e) {}
  }
  function isConfigured() {
    return !!(config.apiKey && config.model);
  }
  function providerLabel() {
    const p = PROVIDERS[config.provider];
    return p ? p.label : config.provider;
  }

  // Le panneau de connexion affiche un journal qui dÃ©file en continu, comme
  // le loader, pour donner l'impression d'un vrai Ã©tablissement de session.
  let gateLogLines = [];
  function gateLog(line) {
    gateLogLines.push(line);
    if (gateLogLines.length > 3) gateLogLines.shift();
    gateLogEl.innerHTML = "";
    for (const l of gateLogLines) {
      const d = document.createElement("div");
      d.textContent = l;
      gateLogEl.appendChild(d);
    }
  }
  // Une entrÃ©e de connexion typique : dÃ©calage alÃ©atoire entre chaque ligne.
  function gateLogSequence(items) {
    let i = 0;
    function next() {
      if (i >= items.length) return;
      gateLog(items[i++]);
      setTimeout(next, 180 + Math.floor(Math.random() * 420));
    }
    next();
  }

  // Liste de repli, presente avant toute requete reseau. Passe par le meme
  // chemin que la liste dynamique pour ne pas avoir deux formats a maintenir.
  function fillGateModels() {
    const p = PROVIDERS[currentProviderId];
    if (!p.models.some(m => m.id === config.model)) {
      config.model = p.models.length ? p.models[0].id : "";
    }
    renderModelOptions(p.models.map(m => m.id));
  }

  // Le catalogue figÃ© dans PROVIDERS n'est qu'un repli : on interroge le point
  // de terminaison /models du fournisseur pour lister tout ce qu'il propose
  // vraiment. Un modÃ¨le sorti hier est ainsi selectionnable sans toucher au
  // code. Le cache evite de re-interroger a chaque ouverture du panneau.
  const modelCache = new Map();
  function cachedModels(id) {
    try {
      const raw = localStorage.getItem("samaritain.models." + id);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.ids) && parsed.ids.length) {
        return { ids: parsed.ids, at: parsed.at || 0, fresh: false };
      }
    } catch (e) {}
    return null;
  }
  function storeModels(id, ids) {
    modelCache.set(id, ids);
    try { localStorage.setItem("samaritain.models." + id, JSON.stringify({ ids: ids, at: Date.now() })); } catch (e) {}
  }
  // Six heures : assez pour ne pas marteler l'API, assez court pour voir sortir
  // un nouveau modÃ¨le dans la journee.
  const MODELS_TTL_MS = 6 * 60 * 60 * 1000;

  // Liste complete du fournisseur courant, independante du filtre.
  let allModelIds = [];
  // Hauteur maximale de la liste affichee : au-dela, un scroll. Sans plafond,
  // OpenRouter qui expose plusieurs centaines de modeles pushes le bouton de
  // connexion hors de l'ecran.
  const MODEL_LIST_MAX = 9;
  let modelHits = [];
  let modelCursor = -1;
  function renderModelOptions(ids) {
    allModelIds = ids.slice();
    applyModelFilter();
  }
  function closeModelList() {
    gateModelListEl.hidden = true;
    gateModelListEl.innerHTML = "";
    modelCursor = -1;
  }
  // OpenRouter expose plusieurs centaines de modeles : on filtre sur chaque
  // frappe. Un mot sans resultat laisse la liste vide, l'utilisateur voit alors
  // que sa saisie ne correspond a rien.
  function applyModelFilter() {
    const p = PROVIDERS[currentProviderId];
    const keep = config.model;
    const q = gateModelSel.value.trim().toLowerCase();
    const hits = q
      ? allModelIds.filter(id => id.toLowerCase().indexOf(q) !== -1)
      : allModelIds;
    modelHits = hits;

    gateModelListEl.innerHTML = "";
    if (hits.length) {
      for (const id of hits) {
        const row = document.createElement("span");
        row.className = "model-item";
        row.setAttribute("role", "option");
        row.dataset.id = id;
        // Avec une recherche active, seul le fragment pertinent est mis en
        // avant, sinon on ne verrait pas ou porter la saisie.
        if (q) row.innerHTML = highlightMatch(id, q);
        else row.textContent = id;
        gateModelListEl.appendChild(row);
      }
      gateModelListEl.hidden = false;
    } else {
      gateModelListEl.hidden = true;
    }

    if (gateModelCountEl) {
      gateModelCountEl.textContent = allModelIds.length
        ? "(" + (q ? hits.length + "/" + allModelIds.length : allModelIds.length) + ")"
        : "";
    }
    if (hits.length) {
      // Le modele deja choisi reste selectionne s'il passe le filtre, sinon on
      // prend le premier resultat, plus utile qu'un champ vide.
      if (hits.indexOf(keep) !== -1) {
        config.model = keep;
      } else {
        const fallback = p.models.find(m => hits.indexOf(m.id) !== -1);
        config.model = fallback ? fallback.id : hits[0];
      }
      if (document.activeElement !== gateModelSel) gateModelSel.value = config.model;
    }
  }
  // Met en valeur la sous-chaine sans passer par innerHTML sur une donnee
  // distante : seul le texte du modele est insere, les balises viennent de nous.
  function highlightMatch(id, q) {
    const i = id.toLowerCase().indexOf(q);
    if (i === -1) return escapeHtml(id);
    return escapeHtml(id.slice(0, i))
      + '<b class="hl">' + escapeHtml(id.slice(i, i + q.length)) + "</b>"
      + escapeHtml(id.slice(i + q.length));
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pickModel(id) {
    if (!id) return;
    config.model = id;
    gateModelSel.value = id;
    applyModelFilter();
    closeModelList();
    refreshModelName();
  }

  async function loadModelsFromProvider() {
    const p = PROVIDERS[currentProviderId];
    if (!p || !p.listModels) return;
    const id = currentProviderId;

    const cached = cachedModels(id);
    if (cached) {
      renderModelOptions(cached.ids);
      gateLog("modÃ¨les: " + cached.ids.length + " (cache)");
      if (Date.now() - cached.at < MODELS_TTL_MS) return;
    }
    if (!config.apiKey) {
      gateLog("modÃ¨les: clÃ© requise pour la liste");
      return;
    }

    gateModelSel.setAttribute("aria-busy", "true");
    gateLog("modÃ¨les: interrogation " + p.label.toLowerCase() + "â€¦");
    try {
      const ids = await p.listModels({ apiKey: config.apiKey });
      // Le fournisseur a pu repondre apres un changement de selection.
      if (id !== currentProviderId) return;
      const clean = ids.filter(Boolean).sort();
      if (clean.length) {
        storeModels(id, clean);
        renderModelOptions(clean);
        gateLog("modÃ¨les: " + clean.length + " disponibles");
      } else {
        gateLog("modÃ¨les: liste vide, repli sur la liste intÃ©grÃ©e");
      }
    } catch (err) {
      if (id !== currentProviderId) return;
      console.log("[warn] " + ["[models] liste impossible", describeError(err)].join(" "));
      // CORS bloque la plupart des appels /models depuis un navigateur : on
      // garde la liste intÃ©grÃ©e plutÃ´t que de bloquer l'utilisateur.
      gateLog("modÃ¨les: indisponible, liste intÃ©grÃ©e");
    } finally {
      if (id === currentProviderId) gateModelSel.removeAttribute("aria-busy");
    }
  }

  function buildGateProviders() {
    gateProvidersEl.innerHTML = "";
    for (const id of Object.keys(PROVIDERS)) {
      const p = PROVIDERS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = id === currentProviderId ? "active" : "";
      btn.innerHTML = (PROVIDER_LOGOS[id] || "")
        + "<span>" + p.label + "</span>";
      // Couleur de marque appliquee au logo via currentColor, uniquement quand
      // le bouton n'est pas selectionne. En actif, aucune couleur en ligne : le
      // CSS impose le contraste, sinon la couleur inline gagnerait et le logo
      // resterait invisible sur le fond clair du theme sombre.
      if (id !== currentProviderId && PROVIDER_COLORS[id]) {
        btn.querySelector("svg").style.color = PROVIDER_COLORS[id];
      }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentProviderId = id;
        config.provider = id;
        // Chaque service a sa propre clÃ© : on repart d'un champ vide plutÃ´t que
        // de laisser une clÃ© d'un autre fournisseur dans l'input.
        config.apiKey = "";
        // La liste affichÃ©e appartient au fournisseur prÃ©cÃ©dent.
        closeModelList();
        gateModelSel.value = "";
        fillGateModels();
        updateGateKeyRow();
        buildGateProviders();
        refreshModelName();
        gateLog("fournisseur: " + p.label.toLowerCase());
      });
      gateProvidersEl.appendChild(btn);
    }
  }

  function updateGateKeyRow() {
    const p = PROVIDERS[currentProviderId];
    gateKeyLinkEl.href = p.keyUrl;
    const has = !!config.apiKey;
    gateKeyStateEl.textContent = has ? "clÃ© dÃ©tectÃ©e" : "clÃ© requise";
    gateKeyStateEl.classList.toggle("ok", has);
    gateKeyInput.value = config.apiKey;
    gateSubmitEl.disabled = !has;
  }
  function refreshModelName() {
    modelNameEl.textContent = providerLabel() + (config.model ? " / " + config.model : "");
  }

  function syncGate() {
    currentProviderId = config.provider;
    closeModelList();
    fillGateModels();
    updateGateKeyRow();
    buildGateProviders();
    refreshModelName();
    loadModelsFromProvider();
  }

  // Retour au panneau de connexion : on masque l'app, on garde la config
  // courante pour pouvoir la modifier.
  function showGate() {
    document.body.classList.add("booting");
    gateEl.style.display = "flex";
    syncGate();
    gateLogSequence([
      "session: nouvelle",
      "fournisseur: " + providerLabel().toLowerCase(),
      "en attente d'une clÃ©"
    ]);
  }
  function hideGate() {
    gateEl.style.display = "none";
    document.body.classList.remove("booting");
    closeModelList();
  }

  gateKeyInput.addEventListener("input", () => {
    const val = gateKeyInput.value.trim();
    config.apiKey = val;
    const has = !!val;
    gateKeyStateEl.textContent = has ? "clÃ© dÃ©tectÃ©e" : "clÃ© requise";
    gateKeyStateEl.classList.toggle("ok", has);
    gateSubmitEl.disabled = !has;
  });

  gateModelSel.addEventListener("input", (e) => {
    e.stopPropagation();
    applyModelFilter();
    if (allModelIds.indexOf(gateModelSel.value) !== -1) {
      config.model = gateModelSel.value;
      refreshModelName();
    }
  });
  gateModelListEl.addEventListener("mousedown", (e) => {
    const row = e.target.closest ? e.target.closest(".model-item") : null;
    if (!row) return;
    e.preventDefault();
    pickModel(row.dataset.id);
  });
  gateModelListEl.addEventListener("mousemove", (e) => {
    const row = e.target.closest ? e.target.closest(".model-item") : null;
    if (!row) return;
    highlightModelRow(row.dataset.id);
  });
  function highlightModelRow(id) {
    const rows = gateModelListEl.children;
    modelCursor = -1;
    for (let i = 0; i < rows.length; i++) {
      const on = rows[i].dataset.id === id;
      rows[i].classList.toggle("active", on);
      if (on && rows[i].scrollIntoView) rows[i].scrollIntoView({ block: "nearest" });
    }
  }
  gateModelSel.addEventListener("focus", () => {
    if (allModelIds.length) {
      gateModelSel.value = "";
      applyModelFilter();
    }
  });
  gateModelSel.addEventListener("blur", () => {
    setTimeout(() => {
      if (allModelIds.indexOf(gateModelSel.value) !== -1) {
        config.model = gateModelSel.value;
        refreshModelName();
      } else gateModelSel.value = config.model;
      closeModelList();
    }, 120);
  });
  gateModelSel.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!modelHits.length) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      modelCursor = (modelCursor + dir + modelHits.length) % modelHits.length;
      highlightModelRow(modelHits[modelCursor]);
    } else if (e.key === "Enter") {
      if (modelCursor >= 0 && modelHits[modelCursor]) {
        e.preventDefault();
        e.stopPropagation();
        pickModel(modelHits[modelCursor]);
      }
    } else if (e.key === "Escape") {
      e.stopPropagation();
      gateModelSel.value = config.model;
      closeModelList();
    }
  });

  gateFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (modelCursor >= 0 && modelHits[modelCursor]) {
      config.model = modelHits[modelCursor];
      gateModelSel.value = config.model;
    } else if (allModelIds.indexOf(gateModelSel.value) !== -1) config.model = gateModelSel.value;
    else gateModelSel.value = config.model;
    
    closeModelList();
    config.provider = currentProviderId;
    config.apiKey = gateKeyInput.value.trim();
    if (!config.apiKey) return;
    saveConfig();
    refreshModelName();
    hideGate();
    await playFakeLoader();
    setMode("");
    setText("");
    speakWords("What are your commands ?");
  });

  changeProviderBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closePanel();
    showGate();
  });

  const THEME_KEY = "samaritain.dark";
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const gateThemeBtn = document.getElementById("gateThemeBtn");
  function applyTheme(dark) {
    document.body.classList.toggle("dark", dark);
    const label = "Mode sombre : " + (dark ? "oui" : "non");
    if (themeToggleBtn) themeToggleBtn.textContent = label;
    if (gateThemeBtn) gateThemeBtn.textContent = label;
  }
  function loadTheme() {
    let dark = false;
    try { dark = localStorage.getItem(THEME_KEY) === "1"; } catch (e) {}
    applyTheme(dark);
  }
  function toggleTheme() {
    const dark = !document.body.classList.contains("dark");
    applyTheme(dark);
    try { localStorage.setItem(THEME_KEY, dark ? "1" : "0"); } catch (e) {}
  }
  for (const btn of [themeToggleBtn, gateThemeBtn]) {
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); toggleTheme(); });
  }

  async function callProvider(promptText, onText) {
    const p = PROVIDERS[config.provider];
    if (!p) throw new Error("fournisseur inconnu: " + config.provider);
    const messages = [
      {
        role: "system",
        content: "Tu es une IA malÃ©fique nommÃ©e Samaritain. RÃ©ponds en franÃ§ais, le plus directement "
          + "et clairement possible, en une phrase maximum, sujet verbe complÃ©ment. "
          + "Ne dÃ©veloppe pas."
      },
      { role: "user", content: promptText }
    ];
    const req = p.build(config, messages);
    const res = await fetch(req.url, req.init);
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = (body.error && (body.error.message || JSON.stringify(body.error)))
          || body.message || "";
      } catch (e) {}
      throw new Error("HTTP " + res.status + (detail ? " â€” " + detail : ""));
    }
    if (!res.body) {
      const data = await res.json();
      const text = p.parse(data) || "";
      if (text) onText(text);
      return text;
    }
    return readSseStream(res.body, p.parse, onText);
  }

  async function queryModel(promptText) {
    setMode("thinking");
    if (dotsEl) dotsEl.hidden = false;
    setText("");
    streamQueue = [];
    streamIndex = 0;
    streamStarted = false;
    lastWordCount = 0;
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    console.log("[info] " + ["[gen] demande=" + JSON.stringify(promptText)].join(" "));
    showThinkingStatus();

    if (!isConfigured()) {
      setMode("");
      if (dotsEl) dotsEl.hidden = true;
      console.log("[warn] [gen] aucun fournisseur configure");
      showStatus("Configurez une cle API dans les reglages");
      await sleep(3000);
      hideStatus();
      isBusy = false;
      return;
    }

try {
      let full = "";
      const answer = await callProvider(promptText, (partial) => {
        const trimmed = partial.trim();
        if (!trimmed) return;
        full = trimmed;
        playStreamedWords(trimmed);
      });
      full = (answer || full || "").trim();
      setMode("");
      if (dotsEl) dotsEl.hidden = true;
      console.log("[info] [gen] reponse=" + JSON.stringify(full));
      if (!full) {
        showStatus("Aucune reponse");
        await sleep(2000);
        hideStatus();
      } else {
        await speakWords(full);
      }
    } catch (err) {
      setMode("");
      if (dotsEl) dotsEl.hidden = true;
      console.log("[error] [gen] echec " + describeError(err));
      hideStatus();
    } finally {
      isBusy = false;
    }
  }

  document.addEventListener("touchstart", () => { if (!isBusy) startListening(); }, { passive: true });
  document.addEventListener("click", () => { if (!isBusy) startListening(); });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!isBusy) startListening();
    }
  });

  let panelClosing = false;
  function closePanel() {
    if (!panelEl.classList.contains("open") || panelClosing) return;
    panelClosing = true;
    panelEl.classList.add("closing");
    setTimeout(() => {
      panelEl.classList.remove("open", "closing");
      panelClosing = false;
    }, 300);
  }
  function togglePanel() {
    if (panelEl.classList.contains("open")) {
      closePanel();
    } else {
      panelEl.classList.add("open");
    }
  }

  document.getElementById("settings").addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });

  const logBtn = document.getElementById("logBtn");
  const logView = document.getElementById("logView");
  const copyLogBtn = document.getElementById("copyLogBtn");
  let logShown = false;
  function renderLog() {
    logView.textContent = devLog.join("\n") || "aucune erreur enregistrÃ©e";
    logView.scrollTop = logView.scrollHeight;
  }
  function toggleLog() {
    logShown = !logShown;
    logView.classList.toggle("show", logShown);
    copyLogBtn.style.display = logShown ? "block" : "none";
    if (logShown) renderLog();
  }
  logBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "l" || e.key === "L") toggleLog();
  });
  copyLogBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logView.textContent || "");
      }
    } catch (err) {}
  });

  document.getElementById("replayLoaderBtn").addEventListener("click", async (e) => {
    e.stopPropagation();
    closePanel();
    if (isBusy) return;
    setText("");
    await replayLoader();
    setMode("");
    setText("");
  });

  function blockWhileLoading(e) {
    if (loaderEl.style.display !== "flex") return;
    if (e.type === "keydown" && (e.key === "l" || e.key === "L")) return;
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener("click", blockWhileLoading, true);
  document.addEventListener("keydown", blockWhileLoading, true);

  // AppliquÃ© avant toute autre chose : sinon la page s'affiche en clair puis
  // bascule, ce qui donne un flash blanc Ã  chaque rechargement.
  loadTheme();
  loadConfig();
  refreshModelName();

  // PremiÃ¨re visite : le panneau de connexion s'affiche, le faux chargement
  // n'est jouÃ© qu'une fois la clÃ© enregistrÃ©e.
  (async () => {
    if (isConfigured()) {
      hideGate();
      await playFakeLoader();
      setMode("");
      setText("");
      speakWords("What are your commands ?");
    } else {
      showGate();
    }
  })();
