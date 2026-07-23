#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from sys import exit

class ExampleServer(SimpleHTTPRequestHandler):
	def end_headers(self):
		#These headers are required for cross-origin isolation, which is
		#required for shared array buffers. See in JS: `crossOriginIsolated`.
		self.send_header("Cross-Origin-Opener-Policy", "same-origin")
		self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
		super().end_headers()

web_server = None
error = None
ports = [8080, 8081, 8100, 8090, 8091]
for port in ports:
	try:
		web_server = ThreadingHTTPServer(('localhost', port), ExampleServer)
		break
	except OSError as e:
		error = e
		continue

if not web_server:
	print("Failed to start web server on ports " + ", ".join([str(p) for p in ports]) + ".")
	print(error)
	exit(1)
	
print("Server started at http://%s:%s." % (
	web_server.server_name or web_server.server_address[0],
	web_server.server_port
))

try:
	web_server.serve_forever()
except KeyboardInterrupt:
	web_server.server_close()
	print("\rGood-bye!")