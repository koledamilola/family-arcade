# 🎮 Game Maker Guide

Hi game maker! This guide helps your games work great on **Family Arcade**.

## The easy rules

1. **Your game must run in a web browser.** HTML + JavaScript games are perfect.
2. **Start page = `index.html`.** If your game is one file, that's it! If it has
   pictures, sounds or other files, put them all in one folder and **zip the folder**.
3. **Use relative paths** for your files, like `images/ship.png`, **not** `/images/ship.png`
   or `C:\Users\...`.
4. **Saving works.** You can use `localStorage` to save high scores and levels like normal.

## 🏆 Put your game on the leaderboard

When the player finishes (game over, level done, etc.), add this line:

```js
if (window.FamilyArcade) window.FamilyArcade.submitScore(score);
```

That's it! The arcade shows the best score for each player. (Tell the grown-up to
switch on **"This game has a leaderboard"** when they upload it.)

Tips:
- Send the score **once** at the end, not every frame.
- For time-based games (fastest wins), send the time in seconds and ask the grown-up
  to tick **"Lower is better"**.

## 🤖 Copy-paste this into your AI vibecoding tool

> Make this a single-page HTML5 game that works inside an iframe on a family game website.
> Put everything in one `index.html` file if possible (or use only relative file paths).
> Make the canvas fill the whole window and resize when the window resizes.
> Support keyboard controls, and also touch controls for phones and tablets.
> Support game controllers using the Gamepad API (`navigator.getGamepads()`).
> When the game ends, call `if (window.FamilyArcade) window.FamilyArcade.submitScore(score);` once.
> Save the best score with `localStorage`.
> Don't use alert(), prompt() or confirm() popups. Draw messages on the screen instead.

## 🧰 Game engines that work

| Tool | How to export |
| --- | --- |
| Plain HTML/JS, p5.js, Phaser, Kaboom/Kaplay, Three.js | Zip the folder with `index.html` |
| Godot 4 | Export → **Web**, turn **off** "Thread Support", zip the output folder |
| Unity | Build → **WebGL**, set **Compression Format: Disabled** (or tick *Decompression Fallback*), zip the build folder |
| Construct 3 / GDevelop | Export → **HTML5 / Web**, zip the folder |
| PICO-8 | `export game.html`, zip the `.html` and `.js` together |
| Scratch | Use TurboWarp Packager → **Plain HTML**, upload the `.html` file |
| Hosted elsewhere (itch.io, Replit…) | Use **Web link** when uploading |

## ❓ My game doesn't work!

- **Black screen?** Open the browser's developer console (F12) and look for red errors.
  Usually a file path is wrong (check upper/lower case: `Ship.png` ≠ `ship.png`).
- **Keyboard not working?** Click on the game first.
- **Too big?** Each file must be under 50 MB.
