// The commercial's timing, shared by the picture (composition.js) and the sound
// (audio.mjs) so they can't drift apart. Times are in seconds.
globalThis.PIXSUP_TIMELINE = {
  fps: 30,
  duration: 15,
  // [when the number appears, the number]
  ticks: [
    [0, 10], [3.0, 9], [3.8, 8], [4.6, 7], [5.4, 6], [6.2, 5],
    [7.0, 4], [7.5, 3], [8.0, 2], [8.5, 1],
  ],
  numberSlam: 1.5, // the big red 10 lands
  tap: 9.0, // the finger hits SAVE
  wall: 10.0, // scene 4
  end: 13.0, // scene 5
};
