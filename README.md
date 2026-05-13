# 粵讀 - JyutRead

## Cantonese TTS on Android

Android Chrome/Edge often fall back to Mandarin because browser text-to-speech depends on voices installed on the device. JyutRead can use a Vercel serverless API backed by Microsoft Edge online TTS so pronunciation stays Cantonese on mobile.

### 1. Deploy the Vercel API

1. Import this GitHub repository into Vercel.
2. Add these optional Vercel environment variables:
   - `EDGE_TTS_VOICE`: defaults to `zh-HK-HiuMaanNeural`
   - `ALLOWED_ORIGIN`: use `https://mason3210.github.io`
3. Deploy the Vercel project.
4. The TTS endpoint will be:

```text
https://your-vercel-project.vercel.app/api/tts
```

### 2. Connect GitHub Pages to the API

In GitHub, open **Settings > Secrets and variables > Actions > Variables** and add:

```text
VITE_TTS_API_URL=https://your-vercel-project.vercel.app/api/tts
```

Then rerun the GitHub Pages workflow or push a new commit. If `VITE_TTS_API_URL` is not set, the app still falls back to browser TTS.
