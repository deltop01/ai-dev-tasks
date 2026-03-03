function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeScript(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text) {
  const cleaned = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  return cleaned.split(/(?<=[.!?])\s+/g).map((s) => s.trim()).filter(Boolean);
}

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function toTitleCaseShort(s, maxWords = 12) {
  const words = s.replace(/["']/g, "").trim().split(/\s+/).filter(Boolean);
  const trimmed = words.slice(0, maxWords);
  let out = trimmed.join(" ");
  out = out.replace(/[,;:]$/, "");
  if (!out.endsWith(".") && !out.endsWith("!") && !out.endsWith("?")) out += ".";
  return out;
}

const DEFAULT_SECTION_LABELS = [
  "Cold Open — Confession",
  "Fast Rise — Momentum",
  "The Shift — Denial",
  "Doubling Down — Rationalization",
  "The Crack — Liquidity",
  "Emotional Pivot — Identity",
  "Reveal — The Real Mistake",
  "Reframe — Humbling",
  "Close — Next Hook"
];

const DEFAULT_SCENE_TYPES = [
  "negative-space",
  "line-rise",
  "line-dip",
  "word-stack",
  "line-dip",
  "negative-space",
  "fracture",
  "reset",
  "negative-space"
];

function estimateSecondsForText(text, wpm, pauseMultiplier) {
  const wc = wordCount(text);
  const minutes = wc / Math.max(1, wpm);
  return Math.max(1, minutes * 60 * pauseMultiplier);
}

function groupSentencesIntoScenes(sentences, policy) {
  const chunks = [];
  const seconds = [];
  let buf = [];
  let bufSeconds = 0;

  for (const sentence of sentences) {
    const sSec = estimateSecondsForText(sentence, policy.wpm, policy.pauseMultiplier);

    if (buf.length > 0 && bufSeconds + sSec > policy.maxS) {
      chunks.push(buf.join(" "));
      seconds.push(clamp(Math.round(bufSeconds), policy.minS, policy.maxS));
      buf = [];
      bufSeconds = 0;
    }

    buf.push(sentence);
    bufSeconds += sSec;
  }

  if (buf.length > 0) {
    chunks.push(buf.join(" "));
    seconds.push(clamp(Math.round(bufSeconds), policy.minS, policy.maxS));
  }

  while (chunks.length > 12) {
    let minIdx = 0;
    let minSum = Infinity;
    for (let i = 0; i < seconds.length - 1; i += 1) {
      const sum = seconds[i] + seconds[i + 1];
      if (sum < minSum) {
        minSum = sum;
        minIdx = i;
      }
    }

    chunks[minIdx] = `${chunks[minIdx]} ${chunks[minIdx + 1]}`.trim();
    seconds[minIdx] = clamp(Math.round(minSum), policy.minS, policy.maxS);
    chunks.splice(minIdx + 1, 1);
    seconds.splice(minIdx + 1, 1);
  }

  return { chunks, seconds };
}

function pickSceneLabel(idx, total) {
  if (idx < DEFAULT_SECTION_LABELS.length) return DEFAULT_SECTION_LABELS[idx];
  if (idx === total - 1) return "Close — Resolution";
  return `Section ${idx + 1}`;
}

function pickSceneType(idx) {
  return DEFAULT_SCENE_TYPES[idx] || "text";
}

function buildBeatsForChunk(chunk, sceneType, idx, total, fractureLevel) {
  const sents = splitSentences(chunk);
  const beats = [];
  const isHook = idx === 0;
  const isReveal = sceneType === "fracture" || idx === 6;
  const isClose = idx === total - 1;

  const first = sents[0] || chunk;
  const titleText = toTitleCaseShort(first, isHook ? 10 : 12);

  beats.push({
    type: "text",
    text: titleText.replace(/\.$/, isHook ? "" : "."),
    style: isHook ? "title" : "subtitle",
    emphasis: isHook ? "high" : "medium"
  });

  if (isHook || idx === 5) beats.push({ type: "pause", seconds: 2 });

  if (sents.length > 1) {
    beats.push({
      type: "text",
      text: toTitleCaseShort(sents[1], 10),
      style: "body",
      emphasis: "medium"
    });
  }

  if (sceneType === "line-rise") beats.push({ type: "line", variant: "rise", strength: 0.85 });
  else if (sceneType === "line-dip") beats.push({ type: "line", variant: "flat-then-dip", strength: 0.7 });
  else if (sceneType === "word-stack") {
    beats.push({
      type: "word-stack",
      words: ["CONVICTION", "THESIS", "CONTROL"],
      style: "title",
      emphasis: "medium"
    });
  } else if (sceneType === "fracture") {
    beats.push({
      type: "word-stack",
      words: ["LEVERAGE", "TIMING", "RISK"],
      style: "title",
      emphasis: "low"
    });
    beats.push({ type: "fracture", level: clamp(fractureLevel + 0.2, 0, 1) });
    beats.push({ type: "text", text: "CONCENTRATION.", style: "title", emphasis: "high" });
  } else if (sceneType === "reset") {
    beats.push({ type: "pause", seconds: 1 });
  }

  if (isClose) {
    beats.push({ type: "pause", seconds: 2 });
    beats.push({ type: "text", text: "Next: The warning signs I ignored.", style: "body", emphasis: "medium" });
  }

  if (isReveal || idx === 5) {
    beats.push({ type: "text", text: "This is where it breaks.", style: "whisper", emphasis: "high" });
  }

  return beats;
}

function buildSceneSystems(sceneType) {
  if (sceneType === "fracture") return ["particles", "grain", "vignette", "cameraDrift"];
  if (sceneType === "negative-space") return ["grain", "vignette", "cameraDrift"];
  if (sceneType === "reset") return ["grain", "cameraDrift"];
  return ["particles", "grain", "cameraDrift"];
}

function validateEpisode(data) {
  const isInt = (n) => typeof n === "number" && Number.isInteger(n);

  if (!data || typeof data !== "object") throw new Error("Episode JSON: not an object");
  if (data.engineVersion !== "1.0") throw new Error("engineVersion must be '1.0'");
  if (!data.meta) throw new Error("Missing meta");
  if (data.meta.fps !== 30) throw new Error("meta.fps must be 30");

  if (!Array.isArray(data.meta.resolution) || data.meta.resolution[0] !== 1920 || data.meta.resolution[1] !== 1080) {
    throw new Error("meta.resolution must be [1920,1080]");
  }

  if (!Array.isArray(data.timeline) || data.timeline.length === 0) {
    throw new Error("timeline must be non-empty array");
  }

  for (const scene of data.timeline) {
    if (!scene.id) throw new Error("scene.id missing");
    if (!isInt(scene.seconds)) throw new Error(`scene ${scene.id}: seconds must be integer`);
    if (scene.seconds < data.meta.durationPolicy.minSceneSeconds || scene.seconds > data.meta.durationPolicy.maxSceneSeconds) {
      throw new Error(`scene ${scene.id}: seconds out of bounds`);
    }
    if (!Array.isArray(scene.beats) || scene.beats.length === 0) throw new Error(`scene ${scene.id}: beats missing`);
    if (!scene.audio || !Array.isArray(scene.audio.layers) || scene.audio.layers.length === 0) {
      throw new Error(`scene ${scene.id}: audio.layers missing`);
    }
    if (!scene.audio.layers.some((layer) => layer.src === "ambient")) {
      throw new Error(`scene ${scene.id}: must include ambient layer`);
    }
  }
}

function convertScriptToEpisode({
  script,
  episodeId = "ep001",
  title = "Untitled Episode",
  voiceover,
  ambient = "/audio/ambient_dark.mp3",
  wpm = 145,
  pauseMultiplier = 1.18,
  minSceneSeconds = 5,
  maxSceneSeconds = 30,
  intensity = 0.7,
  fractureLevel = 0.45,
  particleDensity = 0.35
}) {
  const normalized = normalizeScript(script || "");
  const sentences = splitSentences(normalized);
  if (sentences.length === 0) throw new Error("Script appears empty after normalization.");

  const policy = { wpm, pauseMultiplier, minS: minSceneSeconds, maxS: maxSceneSeconds };
  const { chunks, seconds } = groupSentencesIntoScenes(sentences, policy);

  const episode = {
    engineVersion: "1.0",
    meta: {
      episodeId,
      title,
      fps: 30,
      resolution: [1920, 1080],
      voiceover: voiceover || `/audio/${episodeId}.wav`,
      ambient,
      durationPolicy: { wpm, pauseMultiplier, minSceneSeconds, maxSceneSeconds }
    },
    global: {
      palette: { bg: "#0D0D0D", fg: "#F2F2F2", accent: "#9FA3A6" },
      intensity: clamp(intensity, 0, 1),
      fractureLevel: clamp(fractureLevel, 0, 1),
      particleDensity: clamp(particleDensity, 0, 1),
      cameraDrift: 0.25,
      grain: 0.06,
      vignette: 0.25
    },
    timeline: []
  };

  for (let i = 0; i < chunks.length; i += 1) {
    const sceneType = pickSceneType(i);
    episode.timeline.push({
      id: `s${String(i + 1).padStart(2, "0")}`,
      label: pickSceneLabel(i, chunks.length),
      seconds: seconds[i],
      beats: buildBeatsForChunk(chunks[i], sceneType, i, chunks.length, episode.global.fractureLevel),
      visual: { systems: buildSceneSystems(sceneType), sceneType },
      audio: {
        layers: [{ src: "ambient", vol: clamp(0.42 - i * 0.01, 0.35, 0.45) }],
        sfx: sceneType === "fracture" ? [{ src: "/audio/impact_low_hit.mp3", at: "hit", vol: 0.7 }] : []
      }
    });
  }

  validateEpisode(episode);
  return episode;
}

module.exports = { convertScriptToEpisode };
