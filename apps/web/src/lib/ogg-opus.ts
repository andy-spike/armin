/**
 * Minimal Ogg Opus writer (RFC 7845) for mono Opus packets from WebCodecs'
 * `AudioEncoder`. Packets are grouped into pages of up to about one second.
 */
const SAMPLE_RATE = 48_000;
const MAX_SEGMENTS = 255;

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      crcTable[i] = r >>> 0;
    }
  }
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc;
}

function lacing(size: number) {
  const values = Array<number>(Math.floor(size / 255)).fill(255);
  values.push(size % 255);
  return values;
}

function page(
  packets: Uint8Array[],
  granule: number,
  sequence: number,
  serial: number,
  flags: number,
) {
  const segments = packets.flatMap((packet) => lacing(packet.byteLength));
  const bodySize = packets.reduce((sum, packet) => sum + packet.byteLength, 0);
  const out = new Uint8Array(27 + segments.length + bodySize);
  const view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  out[5] = flags;
  view.setBigInt64(6, BigInt(granule), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  out[26] = segments.length;
  out.set(segments, 27);
  let offset = 27 + segments.length;
  for (const packet of packets) {
    out.set(packet, offset);
    offset += packet.byteLength;
  }
  view.setUint32(22, crc32(out), true);
  return out;
}

function opusHead(preSkip: number) {
  const out = new Uint8Array(19);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusHead"), 0);
  out[8] = 1; // version
  out[9] = 1; // mono
  view.setUint16(10, preSkip, true);
  view.setUint32(12, SAMPLE_RATE, true);
  return out;
}

function opusTags() {
  const vendor = new TextEncoder().encode("Armin");
  const out = new Uint8Array(8 + 4 + vendor.byteLength + 4);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusTags"), 0);
  view.setUint32(8, vendor.byteLength, true);
  out.set(vendor, 12);
  return out;
}

/** Pre-skip from an encoder-supplied OpusHead, when the browser provides one. */
export function preSkipFrom(description: AllowSharedBufferSource | undefined) {
  if (!description) return null;
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  if (bytes.byteLength < 12 || new TextDecoder().decode(bytes.subarray(0, 8)) !== "OpusHead")
    return null;
  return bytes[10] | (bytes[11] << 8);
}

/**
 * Wrap encoded packets in an Ogg Opus file. `samples` is each packet's length
 * in 48 kHz samples; `totalSamples` is the real audio length, so players drop
 * the encoder's padding at the end.
 */
export function oggOpus(
  packets: { data: Uint8Array; samples: number }[],
  preSkip: number,
  totalSamples: number,
) {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages = [
    page([opusHead(preSkip)], 0, 0, serial, 0x02),
    page([opusTags()], 0, 1, serial, 0),
  ];
  let sequence = 2;
  let granule = preSkip;
  let batch: Uint8Array[] = [];
  let segments = 0;
  let batchSamples = 0;
  const flush = (last: boolean) => {
    const end = last ? preSkip + totalSamples : granule;
    pages.push(page(batch, Math.max(0, end), sequence++, serial, last ? 0x04 : 0));
    batch = [];
    segments = 0;
    batchSamples = 0;
  };
  packets.forEach((packet, index) => {
    const needed = lacing(packet.data.byteLength).length;
    if (batch.length && (segments + needed > MAX_SEGMENTS || batchSamples >= SAMPLE_RATE))
      flush(false);
    batch.push(packet.data);
    segments += needed;
    batchSamples += packet.samples;
    granule += packet.samples;
    if (index === packets.length - 1) flush(true);
  });
  return new Blob(pages as BlobPart[], { type: "audio/ogg" });
}
