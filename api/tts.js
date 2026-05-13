import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EdgeTTS } from 'node-edge-tts'

const VOICE_NAME = process.env.EDGE_TTS_VOICE || 'zh-HK-HiuMaanNeural'
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

function setCorsHeaders(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  const origin = req.headers.origin
  const responseOrigin = allowedOrigin === '*' ? '*' : origin === allowedOrigin ? origin : allowedOrigin

  res.setHeader('Access-Control-Allow-Origin', responseOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function getRequestText(body) {
  if (typeof body?.text === 'string') return body.text.trim()

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body)
      return typeof parsed?.text === 'string' ? parsed.text.trim() : ''
    } catch {
      return ''
    }
  }

  return ''
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

  const text = getRequestText(req.body)
  if (!text) {
    res.status(400).json({ error: 'Missing text' })
    return
  }

  if (text.length > 200) {
    res.status(400).json({ error: 'Text is too long' })
    return
  }

  const audioPath = path.join(os.tmpdir(), `jyut-read-${randomUUID()}.mp3`)
  try {
    const tts = new EdgeTTS({
      voice: VOICE_NAME,
      lang: 'zh-HK',
      outputFormat: OUTPUT_FORMAT,
      timeout: 20000
    })

    await tts.ttsPromise(text, audioPath)
    const audio = await fs.readFile(audioPath)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.status(200).send(audio)
  } catch (err) {
    res.status(502).json({ error: 'Edge TTS request failed', details: err.message })
  } finally {
    await fs.rm(audioPath, { force: true }).catch(() => {})
  }
}
