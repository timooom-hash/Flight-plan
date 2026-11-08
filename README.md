# Flight Plan

Randomizes the flight plan for 12 planes: a callsign, an entry and an exit with flight levels, and optionally a fast plane, a VIP, the airport and an alternate. It runs from the iPad home screen and works offline.

## Put it on the iPad

1. Create a repository on GitHub and upload every file in this folder to it (Add file → Upload files).
2. In the repository, open Settings → Pages. Under Build and deployment, set Source to Deploy from a branch, pick `main` and `/(root)`, and Save.
3. Once it is published, open `https://<your-user>.github.io/<repository>/` in Safari on the iPad.
4. Share → Add to Home Screen, keep Open as Web App on, and tap Add.

After the first launch it works without a connection. Settings and the last plan are kept on the iPad.

## How it decides

Every rule is in `plan.js`, with a summary at the top of the file:

- Callsigns are green or yellow 1–8 and never repeat.
- Planes 1–6 enter at six different points. A plane may leave where it entered.
- The alternate is never identical to the exit (same point and same level).
- The airport never gets a flight level.
- Fast and VIP each pick one of planes 1–6, possibly the same one.
- The three limits work like one shared bag across entry, exit and alternate. They never drop below what 12 planes need, and show ∞ once they can no longer restrict anything.

## Work on it

There is no build step and there are no dependencies.

| File | Job |
| --- | --- |
| `plan.js` | Every rule. Pure functions, no DOM. |
| `app.js` | Renders both screens, handles taps, remembers settings and the last plan. |
| `index.html` | Markup for both screens. |
| `style.css` | The look. |
| `sw.js` | Offline: the newest files when online, the last ones offline. |
| `plan.test.js`, `sw.test.js` | The checks behind `npm test`. |

`npm test` checks every rule across all 16 module combinations and every limit edge, and that the offline cache lists every file the app ships. It needs Node and nothing else.

## Principles

- One job: set up, then show the plan.
- No taglines, helper text or secondary labels. If a screen needs them to make sense, fix the layout.
- Rules live in `plan.js` and nowhere else.

Type is IBM Plex Mono and IBM Plex Sans, unmodified, under the SIL Open Font License (`OFL.txt`).
