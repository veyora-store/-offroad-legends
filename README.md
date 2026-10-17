# Offroad Legends — mobile browser multiplayer prototype

This is a lightweight Three.js driving prototype with room-code multiplayer using Firebase Realtime Database. It is designed to be hosted on GitHub Pages. The game is a starter prototype, not a finished commercial game.

## Files
- `index.html` — lobby and touch controls
- `style.css` — responsive mobile UI
- `game.js` — low-poly 3D scene, driving controls, Firebase room sync

## 1. Create Firebase backend (free tier is enough to test)
1. Open https://console.firebase.google.com/ and create a project.
2. In Project settings → General → Your apps, add a Web app and copy its `firebaseConfig`.
3. Open Build → Realtime Database → Create database.
4. For a quick prototype, set Realtime Database rules to the following **temporary test rules**:

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

**Security warning:** these rules allow anyone who knows your database URL to read/write room data. Use only for a private test. Do not store passwords, phone numbers or personal data. Before public launch, add Firebase Authentication and validate room membership, player IDs, and write rates with secure rules.

5. Copy the Firebase web config values into the `firebaseConfig` object near the top of `game.js`. `databaseURL` must be the exact URL shown by Firebase. Do not share private service-account credentials; only use the web-app config.

## 2. Publish on GitHub Pages using a phone
1. Create a GitHub repository named `offroad-legends`.
2. Upload `index.html`, `style.css`, `game.js`, and `README.md` to the repository root.
3. Edit `game.js` and replace every placeholder in `firebaseConfig`.
4. In GitHub, open repository Settings → Pages.
5. Under Build and deployment, select **Deploy from a branch**, choose `main` and `/(root)`, then Save.
6. Wait for the published URL. Open it in Chrome. Internet is required for Three.js and Firebase imports.

## 3. Play with friends
1. Open the published HTTPS link.
2. Enter your driver name and tap **CREATE ROOM**.
3. Share the 4–6 character code with friends.
4. Friends open the same link, enter the code, and tap **JOIN**.
5. Use ◀ / ▶ to steer, GAS to accelerate, and BRAKE to slow down. Keyboard arrows/WASD also work on a computer.

## Performance choices
- Low-poly geometry, no real-time shadows, antialiasing disabled.
- Pixel ratio capped at 1.25 to reduce GPU load.
- Small scene and limited objects.
- If a phone struggles, change `Math.min(devicePixelRatio||1,1.25)` to `Math.min(devicePixelRatio||1,0.8)`.

## Important prototype limits
- Online sync is a simple prototype and is not cheat-resistant.
- Firebase test rules are not suitable for a public game.
- The map and vehicles use primitive low-poly shapes; replace them with optimized GLB assets later.
- This first version syncs positions, but is not a physics-authoritative racing server.
