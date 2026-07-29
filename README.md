# My IELTS AI

AI-powered IELTS listening practice. Turn your vocabulary into contextual IELTS listening materials.

## Project Status

My IELTS AI is a focused Listening MVP. It supports batch vocabulary input, IELTS Listening Section 1–4 selection, real AI passage generation, single-voice speech synthesis, transcript display, and custom audio-player controls.

The local server currently supports a protected DeepSeek-compatible model API and Azure Speech credentials through environment variables.

## MVP Goal

The first MVP focuses on one reliable flow:

```text
Target vocabulary
→ IELTS listening passage containing every target word
→ real speech audio
→ playback, transcript, and vocabulary review
```

The product is intentionally focused on IELTS Listening and does not plan to expand into Writing, Reading, or Speaking tools. User accounts, multi-speaker audio, and Voice Studio remain outside the current MVP.

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

The Mock Provider is a lightweight deterministic development fixture. It verifies the application flow but does not represent real AI writing quality.

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
