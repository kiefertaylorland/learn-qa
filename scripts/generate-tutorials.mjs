// Rebuild original silent videos: ffmpeg, Python Pillow, and a TrueType font required.
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tutorials } from '../shared/tutorials.js';
const output = new URL('../public/tutorials/', import.meta.url);
mkdirSync(output, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'qa-tutorials-'));
const font =
  process.env.QA_TUTORIAL_FONT ||
  '/System/Library/Fonts/Supplemental/Arial.ttf';
try {
  for (const t of tutorials) {
    for (let i = 0; i < t.slides.length; i++)
      execFileSync(
        'python3',
        [
          new URL('./render-tutorial-slide.py', import.meta.url).pathname,
          join(temp, `slide-${i}.png`),
          font,
        ],
        { input: JSON.stringify(t.slides[i]) },
      );
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      '1/10',
      '-i',
      join(temp, 'slide-%d.png'),
      '-t',
      '30',
      '-r',
      '6',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      new URL(`${t.id}.mp4`, output).pathname,
    ]);
    writeFileSync(
      new URL(`${t.id}.vtt`, output),
      'WEBVTT\n\n' +
        t.slides
          .map(
            ([title, body], i) =>
              `00:00:${String(i * 10).padStart(2, '0')}.000 --> 00:00:${String((i + 1) * 10).padStart(2, '0')}.000\n${title}. ${body.replaceAll('\n', ' ')}\n`,
          )
          .join('\n'),
    );
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
