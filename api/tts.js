const VOICE_NAME = process.env.AZURE_SPEECH_VOICE || 'yue-HK-HiuMaanNeural'
const OUTPUT_FORMAT = 'audio-16khz-32kbitrate-mono-mp3'

function setCorsHeaders(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  const origin = req.headers.origin
  const responseOrigin = allowedOrigin === '*' ? '*' : origin === allowedOrigin ? origin : allowedOrigin

  res.setHeader('Access-Control-Allow-Origin', responseOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default async function handler(req, res) {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION

  if (!speechKey || !speechRegion) {
    res.status(500).json({ error: 'Azure Speech is not configured' })
    return
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) {
    res.status(400).json({ error: 'Missing text' })
    return
  }

  if (text.length > 200) {
    res.status(400).json({ error: 'Text is too long' })
    return
  }

  const ssml = `<speak version="1.0" xml:lang="yue-HK"><voice xml:lang="yue-HK" name="${VOICE_NAME}">${escapeXml(text)}</voice></speak>`
  const azureUrl = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`

  const azureResponse = await fetch(azureUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'jyut-read'
    },
    body: ssml
  })

  if (!azureResponse.ok) {
    const details = await azureResponse.text()
    res.status(502).json({ error: 'Azure Speech request failed', details })
    return
  }

  const audio = Buffer.from(await azureResponse.arrayBuffer())
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.status(200).send(audio)
}
