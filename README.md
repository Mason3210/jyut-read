# 粵讀 - JyutRead

## Cantonese TTS on Android

Android Chrome/Edge often fall back to Mandarin because browser text-to-speech depends on voices installed on the device. JyutRead can use a Vercel serverless API backed by Azure Speech so pronunciation stays Cantonese on mobile.

### 1. Create Azure Speech resource

1. Open the Azure Portal and create a **Speech service** resource.
2. Choose a region that supports Cantonese neural TTS, for example `eastasia`.
3. Copy one Speech key and the region name.

The API defaults to the Cantonese voice `yue-HK-HiuMaanNeural`.

### 2. Deploy the Vercel API

1. Import this GitHub repository into Vercel.
2. Add these Vercel environment variables:
   - `AZURE_SPEECH_KEY`: your Azure Speech key
   - `AZURE_SPEECH_REGION`: your Azure Speech region, for example `eastasia`
   - `AZURE_SPEECH_VOICE`: optional, defaults to `yue-HK-HiuMaanNeural`
   - `ALLOWED_ORIGIN`: optional, use `https://mason3210.github.io`
3. Deploy the Vercel project.
4. The TTS endpoint will be:

```text
https://your-vercel-project.vercel.app/api/tts
```

### 3. Connect GitHub Pages to the API

In GitHub, open **Settings > Secrets and variables > Actions > Variables** and add:

```text
VITE_TTS_API_URL=https://your-vercel-project.vercel.app/api/tts
```

Then rerun the GitHub Pages workflow or push a new commit. If `VITE_TTS_API_URL` is not set, the app still falls back to browser TTS.
