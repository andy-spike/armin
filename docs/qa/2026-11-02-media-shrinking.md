# Media shrinking, browser export, and higher image limits

Running-app walkthrough on the worktree's local deployment
(`http://armin-cf02f707a7.localhost:36844`, sample account), driven with
agent-browser in headless Chromium on Linux. Test files were generated with
Pillow; sizes are for those files, not for real user libraries.

## 1. Images shrink on the device

Uploaded through the card editor's **Add image** button. Sizes are the bytes
the browser sent and the server stored (`media` table).

| File | Original | Stored | Notes |
| --- | --- | --- | --- |
| `photo.jpg` 4000×3000, EXIF orientation 6, GPS, camera make | 11,154,635 B (over the 10 MiB server limit) | 516,834 B WebP, 1200×1600 | Accepted; turned upright; no EXIF or GPS left in the file |
| `diagram.png` 2400×1500 text and flat colours | 107,806 B | 60,958 B WebP, 1600×1000 | Lossless (`VP8L` chunk) |
| `small.jpg` 600×400, no EXIF | 108,675 B | 108,675 B JPEG | Original kept: re-encoding saved less than 10% |

- New `media` rows have width and height and no `thumbnailId`; the quota
  counts only the stored bytes.
- `/media/<file>` responds with `Cache-Control: private, max-age=31536000, immutable`.

![Editor with uploaded images](2026-11-02-media-shrinking/01-editor-images.png)

Not verified on a real device: Safari's WebP encoding and the JPEG/PNG
fallback path, and iOS canvas limits for very large camera photos.

## 2. Audio shrinks on the device

Uploaded through the card editor's **Add audio** button in Chromium.

| File | Original | Stored | Notes |
| --- | --- | --- | --- |
| `speech.mp3` espeak-ng Spanish sentence, stereo 128 kbps, 0.5 s silence at each end, 3.66 s | 59,811 B | 10,173 B Ogg Opus, mono 48 kHz, 2.56 s | Silence trimmed to 0.1 s padding |
| `long.wav` 60 s stereo PCM | 10,584,078 B (over the 10 MiB server limit) | 238,406 B Ogg Opus, 59.99 s | Accepted |
| `low.mp3` mono 24 kbps | 15,168 B | 15,168 B MP3 | Already below the target quality; original kept |

- `ffprobe` reads the stored speech clip as Opus, mono, 48 kHz, and `ffmpeg`
  decodes it without errors (Ogg page checksums valid).
- In the browser the clip decodes, plays to the end, and fires `ended`.
- Chromium reports `Infinity` for the `<audio>` element's duration of these
  Ogg files because the media route doesn't serve byte ranges. The card audio
  player doesn't use duration.

Not verified: Opus playback on Mac Safari and iPhone (caniuse lists iOS Safari
18.4+ as supported and Mac Safari as partial), and encoding in Firefox and
Safari 26.
