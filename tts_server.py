"""
Simple Edge TTS proxy server for JyutRead
Run: python3 tts_server.py
Then access: http://SERVER_IP:9876/tts?text=你好
"""

import asyncio
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from edge_tts import Communicate, list_voices

class TTSHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/tts':
            params = parse_qs(parsed.query)
            text = params.get('text', [''])[0]
            
            if not text:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'Missing text parameter')
                return
            
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.end_headers()
            
            try:
                async def generate():
                    communicate = Communicate(text, 'zh-HK-HiuMaanNeural', rate='-15%')
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            try:
                                self.wfile.write(chunk["data"])
                                self.wfile.flush()
                            except:
                                break
                
                asyncio.run(generate())
            except Exception as e:
                print(f"[TTS Error] {e}")
                
        elif parsed.path == '/voices':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            async def list_v():
                voices = await list_voices()
                yue_voices = [v for v in voices if v['Locale'] == 'zh-HK']
                self.wfile.write(json.dumps(yue_voices, indent=2).encode())
            
            asyncio.run(list_v())
        elif parsed.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write('JyutRead TTS Server\nUsage: /tts?text=你好'.encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        print(f"[TTS] {args[0]}")

if __name__ == '__main__':
    import socket
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    print('🎤 JyutRead TTS Server running!')
    print(f'   Local:   http://localhost:9876')
    print(f'   Network: http://{local_ip}:9876')
    print(f'   Test:    http://localhost:9876/tts?text=你好')
    HTTPServer(('0.0.0.0', 9876), TTSHandler).serve_forever()
