# Daily videos

Makes vertical videos (1080×1920, for TikTok, Reels and Shorts) from real
Pixsup posts, plus a caption to paste. They land in
`Desktop/Pixsup videos/Daily`.

- **Will it survive?** A real photo that's alive on Pixsup right now, with its
  real countdown, asking viewers to go save it.
- **Today's challenge.** The day's AI photo prompt and any real entries.
- **How to save a post.** The save rule in 3 steps, on a real live photo, using the
  real numbers from Admin settings.
- **Pixsup vs other apps.** What makes Pixsup different, over a wall of live photos.
- **Graveyard roll call.** Real posts that died in the last 24 hours, in black and
  white, with how long they lived.

Run it by double-clicking **Make Pixsup videos** on the Desktop, or:

```
cd tools/daily-video
npm install      # first time only
node make-video.mjs                     # all five
node make-video.mjs survive             # just one
node make-video.mjs howto graveyard     # a few
# names: survive, challenge, howto, versus, graveyard
```

Needs Chrome or Edge. The videos have no sound: add a trending sound in
TikTok or Instagram when posting.
