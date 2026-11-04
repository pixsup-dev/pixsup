# Pixsup 15-second commercial

The picture is drawn frame by frame in a browser page and the sound is
synthesized from code, so the render is exact and has no licensed audio.

| File | What it does |
|---|---|
| `timeline.js` | The timing (countdown, tap, scene changes), shared by picture and sound |
| `composition.html` / `composition.js` | The picture. Open `composition.html?play` to preview it (no sound) |
| `audio.mjs` | The music and sound effects |
| `render.mjs` | Draws the frames, encodes the MP4s and the thumbnail |
| `verify.mjs` | Checks length, size, frame rate, audio, loudness and sync |
| `assets/` | Photos from @george's Pixsup posts |

```
npm install                       # first time only
node render.mjs                   # everything (about 5 minutes)
node render.mjs --encode          # only re-encode (after changing the sound)
node render.mjs --stills 45,270   # check single frames, in .cache/stills
node verify.mjs                   # check the finished videos
```

The finished files go to `Desktop/Pixsup videos/Promo`. Needs Chrome or Edge.
