/**
 * Speech-to-text engines. Each takes 16 kHz mono clips and gives back, per
 * clip, what was said and when (ms from the clip's start):
 *
 *   { name, perCall, transcribe(clips: Float32Array[], { prompt, language }) -> [[{ start_ms, end_ms, text }]] }
 *
 * perCall: how many clips one call takes. Audio never leaves this PC (owner,
 * 2026-10-29: "We won't take it off server"), so there are no online engines.
 *
 *   local        Whisper through transformers.js (no setup; the model downloads into data/models once)
 *   whisper-cpp  whisper.cpp's own program (WHISPER_CPP_BIN, WHISPER_CPP_MODEL): much faster with an NVIDIA card
 *   fake         tests: says how long each clip was
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn as defaultSpawn } from 'node:child_process';
import { RATE, durationMs, wavBuffer } from './audio.js';

export const ENGINES = ['local', 'whisper-cpp', 'fake'];

export function createEngine(cfg, { cacheDir, spawn = defaultSpawn, tmpDir = os.tmpdir() } = {}) {
  const name = cfg.engine;
  if (name === 'fake') return fakeEngine();
  if (name === 'local') return localEngine(cfg, cacheDir);
  if (name === 'whisper-cpp') return whisperCppEngine(cfg, spawn, tmpDir);
  throw new Error(`Unknown speech-to-text engine "${name}" (TRANSCRIBE_ENGINE: ${ENGINES.join(', ')})`);
}

export function fakeEngine() {
  return {
    name: 'fake',
    perCall: 50,
    async transcribe(clips) {
      return clips.map((c) => [{ start_ms: 0, end_ms: durationMs(c), text: `(speech, ${(durationMs(c) / 1000).toFixed(1)} s)` }]);
    },
  };
}

function localEngine(cfg, cacheDir) {
  let asr;
  return {
    name: 'local',
    perCall: 1,
    async transcribe(clips, { language }) {
      if (!asr) {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = cacheDir;
        asr = await pipeline('automatic-speech-recognition', cfg.localModel, { dtype: cfg.localDtype, device: cfg.localDevice });
      }
      const out = [];
      for (const clip of clips) {
        const r = await asr(clip, { language, task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
        const chunks = r.chunks?.length ? r.chunks : [{ timestamp: [0, clip.length / RATE], text: r.text }];
        out.push(
          chunks.map((c) => ({
            start_ms: Math.round((c.timestamp?.[0] ?? 0) * 1000),
            end_ms: Math.round((c.timestamp?.[1] ?? clip.length / RATE) * 1000),
            text: String(c.text ?? '').trim(),
          })),
        );
      }
      return out;
    },
  };
}

function whisperCppEngine(cfg, spawn, tmpDir) {
  if (!cfg.whisperCppBin || !cfg.whisperCppModel) {
    throw new Error('whisper-cpp needs WHISPER_CPP_BIN (whisper-cli) and WHISPER_CPP_MODEL (a ggml .bin model) in .env');
  }
  return {
    name: 'whisper-cpp',
    perCall: 40,
    async transcribe(clips, { prompt, language }) {
      const dir = fs.mkdtempSync(path.join(tmpDir, 'dndapp-whisper-'));
      try {
        const files = clips.map((c, i) => {
          const f = path.join(dir, `${i}.wav`);
          fs.writeFileSync(f, wavBuffer(c));
          return f;
        });
        const args = ['-m', cfg.whisperCppModel, '-l', language, '-oj', '-np', ...(prompt ? ['--prompt', prompt] : []), ...(cfg.threads ? ['-t', String(cfg.threads)] : [])];
        await run(spawn, cfg.whisperCppBin, [...args, ...files.flatMap((f) => ['-f', f])]);
        return files.map((f) => {
          const json = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8'));
          return (json.transcription ?? []).map((s) => ({ start_ms: s.offsets?.from ?? 0, end_ms: s.offsets?.to ?? 0, text: String(s.text ?? '').trim() }));
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

function run(spawn, bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let err = '';
    child.stderr?.on('data', (d) => {
      err = (err + d).slice(-2000);
    });
    child.stdout?.resume();
    child.on('error', (e) => reject(new Error(`Couldn't run whisper.cpp (${bin}): ${e.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`whisper.cpp stopped with code ${code}: ${err.trim().split('\n').at(-1) ?? ''}`))));
  });
}
