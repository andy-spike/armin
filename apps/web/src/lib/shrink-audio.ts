import { oggOpus, preSkipFrom } from "./ogg-opus";

/**
 * Audio is shrunk in the browser before upload: mono Opus at 32 kbps in an Ogg
 * file, with silence trimmed from the start and end. Flashcard audio is mostly
 * short speech, where this sounds the same as the original.
 *
 * The original is kept when the browser can't decode or encode it (WebCodecs
 * `AudioEncoder` needs Chrome 94, Firefox 130, or Safari 26), when it is
 * already at or below the target quality, or when re-encoding saves less than
 * 10%.
 */
const SAMPLE_RATE = 48_000;
const BITRATE = 32_000;
/** Files already near the target bitrate are left alone, so quality never drops twice. */
const SKIP_BELOW_BITRATE = BITRATE * 1.25;
const MIN_SAVING = 0.1;
/** About -50 dBFS: quieter samples at either end count as silence. */
const SILENCE = 0.003;
/** Keep a little air around trimmed audio so words aren't clipped. */
const PAD_SECONDS = 0.1;
const CHUNK_FRAMES = SAMPLE_RATE;

const ENCODER_CONFIG: AudioEncoderConfig = {
  codec: "opus",
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  bitrate: BITRATE,
};

let supported: Promise<boolean> | null = null;
function encoderSupported() {
  supported ??= (async () => {
    if (typeof AudioEncoder === "undefined" || typeof OfflineAudioContext === "undefined")
      return false;
    try {
      return (await AudioEncoder.isConfigSupported(ENCODER_CONFIG)).supported === true;
    } catch {
      return false;
    }
  })();
  return supported;
}

/** Decode, mix to mono, and resample to 48 kHz. */
async function decodeMono(file: Blob) {
  const encoded = await file.arrayBuffer();
  const probe = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const decoded = await probe.decodeAudioData(encoded);
  const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
  if (frames === 0) return null;
  const context = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return { samples: rendered.getChannelData(0), duration: decoded.duration };
}

function trimSilence(samples: Float32Array) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < SILENCE) start++;
  while (end > start && Math.abs(samples[end - 1]) < SILENCE) end--;
  if (start >= end) return samples;
  const pad = Math.round(PAD_SECONDS * SAMPLE_RATE);
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

async function encodeOpus(samples: Float32Array) {
  const packets: { data: Uint8Array; samples: number }[] = [];
  let preSkip: number | null = null;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      preSkip ??= preSkipFrom(metadata?.decoderConfig?.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const length = Math.round(((chunk.duration ?? 20_000) * SAMPLE_RATE) / 1_000_000);
      packets.push({ data, samples: length });
    },
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure(ENCODER_CONFIG);
  for (let offset = 0; offset < samples.length; offset += CHUNK_FRAMES) {
    const frames = samples.subarray(offset, offset + CHUNK_FRAMES);
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 1,
      numberOfFrames: frames.length,
      timestamp: Math.round((offset / SAMPLE_RATE) * 1_000_000),
      data: frames.slice(),
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  if (packets.length === 0) return null;
  // libopus' standard look-ahead at 48 kHz when the browser doesn't report one.
  return oggOpus(packets, preSkip ?? 312, samples.length);
}

/**
 * Return a smaller version of an audio file for upload, or the original when
 * it can't or shouldn't be re-encoded (the server still validates every upload).
 */
export async function shrinkAudio(file: Blob): Promise<Blob> {
  if (!(await encoderSupported())) return file;
  try {
    const decoded = await decodeMono(file);
    if (!decoded) return file;
    if ((file.size * 8) / decoded.duration <= SKIP_BELOW_BITRATE) return file;
    const encoded = await encodeOpus(trimSilence(decoded.samples));
    return encoded && encoded.size <= file.size * (1 - MIN_SAVING) ? encoded : file;
  } catch {
    return file;
  }
}
