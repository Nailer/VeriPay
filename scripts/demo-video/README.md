# How the demo video was made

`demo/veripay-demo.mp4` was not screen-recorded by hand. These two scripts made it:

- `record.mjs` drives the real app in Chrome (Playwright) through the full
  flow — seller claims a link, buyer pays by card, money locks on Monad, buyer
  confirms, seller record updates — and records each phone screen. It runs
  against a local production build of this repo talking to the live Monad
  testnet contracts and Paystack test mode, so every transaction in the video
  is real and on-chain (orders #7–#9 on the escrow come from these runs).
  Fingerprint sign-in is exercised through Chrome's built-in virtual WebAuthn
  authenticator; the card step uses Paystack's test-mode "Success" option.
- `compose.mjs` cuts the recordings into scenes, adds the title cards, and adds
  narration generated with macOS text-to-speech (`narr.mjs` synthesises each
  sentence separately so the burned-in subtitles are timed to the voice).
- `pitch.mjs` builds `demo/veripay-pitch.mp4` the same way from title cards,
  the founder's photo and two clips from the demo recording. Nothing is sped up; the
  charge-to-locked scene is uncut.

They were run from a scratch folder with `playwright-core` installed and the
app serving on `localhost:3000`; paths inside them reflect that. They are kept
here as a record of the method rather than as a supported tool.
