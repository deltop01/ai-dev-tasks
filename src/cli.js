#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { convertScriptToEpisode } = require('./converter');

function parseArgs(argv) {
  const get = (k, fallback) => {
    const idx = argv.indexOf(k);
    if (idx === -1) return fallback;
    return argv[idx + 1];
  };

  return {
    episodeId: get('--episodeId', 'ep001'),
    title: get('--title', 'Untitled Episode'),
    voiceover: get('--voiceover'),
    ambient: get('--ambient', '/audio/ambient_dark.mp3'),
    scriptPath: get('--script'),
    outPath: get('--out'),
    wpm: Number(get('--wpm', '145')),
    pauseMultiplier: Number(get('--pauseMultiplier', '1.18')),
    minSceneSeconds: Number(get('--minSceneSeconds', '5')),
    maxSceneSeconds: Number(get('--maxSceneSeconds', '30')),
    intensity: Number(get('--intensity', '0.7')),
    fractureLevel: Number(get('--fractureLevel', '0.45')),
    particleDensity: Number(get('--particleDensity', '0.35'))
  };
}

async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

(async () => {
  try {
    const args = parseArgs(process.argv.slice(2));
    const script = args.scriptPath
      ? fs.readFileSync(path.resolve(args.scriptPath), 'utf8')
      : await readStdin();

    if (!script.trim()) {
      throw new Error('No script provided. Use --script path/to/script.txt or pipe via stdin.');
    }

    const episode = convertScriptToEpisode({
      script,
      episodeId: args.episodeId,
      title: args.title,
      voiceover: args.voiceover,
      ambient: args.ambient,
      wpm: args.wpm,
      pauseMultiplier: args.pauseMultiplier,
      minSceneSeconds: args.minSceneSeconds,
      maxSceneSeconds: args.maxSceneSeconds,
      intensity: args.intensity,
      fractureLevel: args.fractureLevel,
      particleDensity: args.particleDensity
    });

    const json = JSON.stringify(episode, null, 2);
    if (args.outPath) {
      const out = path.resolve(args.outPath);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, json, 'utf8');
      console.log(`OK: Wrote ${episode.timeline.length} scenes to ${out}`);
    } else {
      console.log(json);
    }

    const totalSeconds = episode.timeline.reduce((sum, scene) => sum + scene.seconds, 0);
    console.error(`Summary: scenes=${episode.timeline.length}, totalSeconds=${totalSeconds}, approxFrames=${totalSeconds * episode.meta.fps}`);
  } catch (error) {
    console.error('ERROR:', error.message || error);
    process.exit(1);
  }
})();
