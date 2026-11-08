# Notes for agents

- Every rule lives in `plan.js` (pure, no DOM). `app.js` only renders and stores; `style.css` is the look; `README.md` has the rules in plain words.
- Run `npm test` after every change. It covers all module combinations and limit edges, and that `sw.js` caches every shipped file.
- No build step, no dependencies. Keep it that way.
- Adding a file the app loads means adding it to `FILES` in `sw.js`; the test fails until you do.
- UI copy: no taglines, helper text or secondary labels. If a screen seems to need one, change the layout instead.
- The look is flight progress strips on a dark bay. Strip type scales with the strip (`cqh`), so keep new strip content in those units.
