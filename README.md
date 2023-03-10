# DDR's __Stardust__

Minimal reproduction of weird worker.postMessage() error.

Serve with `./example_server.py` and visit http://127.0.0.1:8080/ to reproduce.

Expected console output
---
```
Worker Thread: [object Object],[object WebAssembly.Memory].
Worker Thread: [object WebAssembly.Memory],[object Object].
Worker Thread: [object Object],[object WebAssembly.Memory].
Worker Thread: [object WebAssembly.Memory],[object Object].
```

Actual console output
---
- Firefox 109.0.1:
	```
	Worker Thread: [object Object],[object WebAssembly.Memory]. sim.mjs:1:47
	[object MessageEvent] sim.mjs:2:45
	Worker Thread: [object Object],[object WebAssembly.Memory]. sim.mjs:1:47
	[object MessageEvent]
	```
- Chrome 110.0.5481.100:
	```
	Worker Thread: null.
	Worker Thread: [object WebAssembly.Memory],[object Object].
	Worker Thread: null.
	Worker Thread: [object WebAssembly.Memory],[object Object].
	```