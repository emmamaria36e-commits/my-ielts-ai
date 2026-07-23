# My IELTS AI

AI-powered IELTS listening practice. Turn your vocabulary into contextual IELTS listening materials.

## Project Status

My IELTS AI is moving from a static UI demo into a focused Listening MVP. The current prototype supports vocabulary input, scene and voice selection, mock passage generation, transcript display, and custom audio-player controls.

The following parts are not production-ready yet:

- Audio is currently a short demo tone rather than real text-to-speech.
- A real model provider has not yet been tested with production credentials.

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
- Minimal Node backend for protected AI requests and validated model results

## Run the Project

Node.js 20.12 or newer is required for the server-backed flow.

1. Copy `.env.example` to `.env`.
2. Add your model provider key and settings to `.env`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

Pages served by Node use the protected server API automatically. Opening `index.html` directly uses the offline Mock Provider instead, so the UI can still be reviewed without a key.

The Mock Provider is a deterministic development fixture: it combines a stable scene passage with a vocabulary-focus paragraph that contains every validated target word. It verifies the application flow but does not represent real AI writing quality.

Do not place API keys in `index.html`, browser configuration, or client-side JavaScript. The local `.env` file is ignored by Git and is read only by the Node server.

Run `npm test` to verify the model-result contract, Mock parity, target-word checks, HTML rejection, and safe transcript-rendering guard.

## Documentation

- [Product scope](docs/PRODUCT.md)
- [Current and target architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Development log](docs/DEVELOPMENT_LOG.md)
- [Technical decisions](docs/DECISION_LOG.md)
- [Important bug notes](docs/BUG_NOTES.md)
- [AI collaboration notes](docs/AI_COLLABORATION.md)
- [Agent working rules](AGENTS.md)
