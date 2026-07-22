# My IELTS AI

AI-powered IELTS listening practice. Turn your vocabulary into contextual IELTS listening materials.

## Project Status

My IELTS AI is moving from a static UI demo into a focused Listening MVP. The current prototype supports vocabulary input, scene and voice selection, mock passage generation, transcript display, and custom audio-player controls.

The following parts are not production-ready yet:

- Real-provider requests still need a server-side security boundary.
- AI output validation and safe transcript rendering are pending.
- The Mock Provider does not yet guarantee that submitted words appear in its passage.
- Audio is currently a short demo tone rather than real text-to-speech.

## MVP Goal

The first MVP focuses on one reliable flow:

```text
Target vocabulary
→ IELTS listening passage containing every target word
→ real speech audio
→ playback, transcript, and vocabulary review
```

Writing, Reading, Speaking, user accounts, multi-speaker audio, and Voice Studio are outside the current MVP.

## Technology

- Vanilla HTML, CSS, and JavaScript
- Provider-based AI generation layer
- Custom HTML audio-player controls
- Minimal Node backend planned for protected AI and TTS requests

## Run the Project

Node.js 20.12 or newer is required for the server-backed flow.

1. Copy `.env.example` to `.env`.
2. Add your model provider key and settings to `.env`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

Pages served by Node use the protected server API automatically. Opening `index.html` directly uses the offline Mock Provider instead, so the UI can still be reviewed without a key.

Do not place API keys in `index.html`, browser configuration, or client-side JavaScript. The local `.env` file is ignored by Git and is read only by the Node server.

## Documentation

- [Product scope](docs/PRODUCT.md)
- [Current and target architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Development log](docs/DEVELOPMENT_LOG.md)
- [Technical decisions](docs/DECISION_LOG.md)
- [Important bug notes](docs/BUG_NOTES.md)
- [AI collaboration notes](docs/AI_COLLABORATION.md)
- [Agent working rules](AGENTS.md)
