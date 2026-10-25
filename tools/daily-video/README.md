# Daily videos

Makes vertical videos (1080×1920, for TikTok, Reels and Shorts) from real
Pixsup posts, plus a caption to paste. They land in
`Desktop/Pixsup videos/Daily`.

- **Will it survive?** A real photo that's alive on Pixsup right now, with its
  real countdown, asking viewers to go save it.
- **Today's challenge.** The day's AI photo prompt and any real entries.

Run it by double-clicking **Make Pixsup videos** on the Desktop, or:

```
cd tools/daily-video
npm install      # first time only
node make-video.mjs            # both
node make-video.mjs survive    # one
node make-video.mjs challenge
```

Needs Chrome or Edge. The videos have no sound: add a trending sound in
TikTok or Instagram when posting.
