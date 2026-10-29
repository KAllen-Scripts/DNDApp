/**
 * Ogg Opus files: the bot saves each burst of someone's speech as one, and the
 * transcriber reads them back. Small enough to write here (RFC 3533, RFC 7845)
 * rather than add a library; any audio player opens the files.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function crc(buf) {
  let c = 0;
  for (const b of buf) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ b) & 0xff]) >>> 0;
  return c;
}

/** Samples (at 48 kHz) in one Opus packet, from its table-of-contents byte (RFC 6716 §3.1). */
export function opusSamples(packet) {
  if (!packet?.length) return 0;
  const config = packet[0] >> 3;
  const ms = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const code = packet[0] & 3;
  const frames = code === 0 ? 1 : code < 3 ? 2 : (packet[1] ?? 0) & 0x3f;
  return Math.round(ms * 48) * frames;
}

/** An Opus packet of silence (20 ms), used to keep gaps in speech at their real length. */
export const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

function page({ serial, sequence, granule, flags, packets }) {
  const lacing = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0, 'latin1');
  header[5] = flags;
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  Buffer.from(lacing).copy(header, 27);
  const out = Buffer.concat([header, ...packets]);
  out.writeUInt32LE(crc(out), 22);
  return out;
}

/**
 * Writes Opus packets as an Ogg file, a page at a time, through write(buffer).
 * end() writes the last page (it must be called once).
 */
export function createOggOpusWriter(write, { channels = 2, serial = (Math.random() * 2 ** 32) >>> 0 } = {}) {
  let sequence = 0;
  let granule = 0;
  let pending = [];
  let pendingSegments = 0;

  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;
  head[9] = channels;
  head.writeUInt16LE(0, 10); // pre-skip
  head.writeUInt32LE(48000, 12);
  head.writeInt16LE(0, 16);
  head[18] = 0;
  const vendor = Buffer.from('dndapp', 'utf8');
  const tags = Buffer.alloc(16 + vendor.length);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);

  write(page({ serial, sequence: sequence++, granule: 0, flags: 0x02, packets: [head] }));
  write(page({ serial, sequence: sequence++, granule: 0, flags: 0, packets: [tags] }));

  const flush = (last) => {
    if (!pending.length && !last) return;
    write(page({ serial, sequence: sequence++, granule, flags: last ? 0x04 : 0, packets: pending }));
    pending = [];
    pendingSegments = 0;
  };

  return {
    /** Adds one Opus packet. */
    packet(p) {
      const segments = Math.floor(p.length / 255) + 1;
      if (pendingSegments + segments > 255 || pending.length >= 50) flush(false);
      pending.push(p);
      pendingSegments += segments;
      granule += opusSamples(p);
    },
    /** 48 kHz samples written so far. */
    get samples() {
      return granule;
    },
    end() {
      flush(true);
    },
  };
}

/** The Opus packets in an Ogg Opus file (its OpusHead and OpusTags left out), and its channel count. */
export function readOggOpus(buf) {
  const packets = [];
  let partial = [];
  let pos = 0;
  while (pos + 27 <= buf.length) {
    if (buf.toString('latin1', pos, pos + 4) !== 'OggS') throw new Error('Not an Ogg file');
    const count = buf[pos + 26];
    const lacing = buf.subarray(pos + 27, pos + 27 + count);
    let at = pos + 27 + count;
    for (const len of lacing) {
      partial.push(buf.subarray(at, at + len));
      at += len;
      if (len < 255) {
        packets.push(Buffer.concat(partial));
        partial = [];
      }
    }
    pos = at;
  }
  const head = packets.findIndex((p) => p.toString('latin1', 0, 8) === 'OpusHead');
  if (head < 0) throw new Error('Not an Opus file');
  const channels = packets[head][9] || 2;
  return { channels, packets: packets.filter((p) => !['OpusHead', 'OpusTags'].includes(p.toString('latin1', 0, 8))) };
}
