/**
 * Turning saved speech into what speech-to-text reads: Opus packets decoded
 * (opusscript, no native build), mixed to mono and brought down to 16 kHz.
 */
import { createRequire } from 'node:module';
import { readOggOpus } from './ogg.js';

const require = createRequire(import.meta.url);

export const RATE = 16000;

/** 16 kHz mono samples (-1..1) from an Ogg Opus file's bytes. Packets that won't decode are skipped. */
export function decodeOggOpus(buf) {
  const OpusScript = require('opusscript');
  const { channels, packets } = readOggOpus(buf);
  const decoder = new OpusScript(48000, channels, OpusScript.Application.AUDIO);
  const parts = [];
  let total = 0;
  try {
    for (const p of packets) {
      let pcm;
      try {
        pcm = decoder.decode(p);
      } catch {
        continue;
      }
      const s = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
      parts.push(s);
      total += s.length / channels;
    }
  } finally {
    decoder.delete();
  }
  // Mono at 48 kHz, then every three samples averaged into one (a gentle low-pass as it goes down to 16 kHz).
  const mono = new Float32Array(total);
  let i = 0;
  for (const s of parts) {
    for (let j = 0; j < s.length; j += channels) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += s[j + c];
      mono[i++] = v / channels / 32768;
    }
  }
  const out = new Float32Array(Math.floor(mono.length / 3));
  for (let k = 0; k < out.length; k++) out[k] = (mono[3 * k] + mono[3 * k + 1] + mono[3 * k + 2]) / 3;
  return out;
}

/** A 16-bit mono WAV file of the samples. */
export function wavBuffer(samples, rate = RATE) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0, 'latin1');
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write('WAVEfmt ', 8, 'latin1');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'latin1');
  out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return out;
}

export const durationMs = (samples) => Math.round((samples.length / RATE) * 1000);
