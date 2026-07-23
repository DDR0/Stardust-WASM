// Headless regression test for the shared-shadow-stack multithreading bug.
//
// Mirrors the browser reproduction (main.mjs + sim.mjs) using Node worker_threads:
// three threads share ONE WebAssembly.Memory and each runs the wasm `run()` loop,
// which logs the numbers in its 100-wide chunk. Every number in 0..299 must be
// reported exactly `TICKS` times. When the threads share a shadow stack the debug
// build's loop counter `n` gets clobbered across threads and numbers go missing.
//
//   MODE=fixed  (default) applies the per-thread stack + TLS setup  -> must pass
//   MODE=broken replicates the old buggy setup                      -> expected to fail
//
// Usage: node worker/test_repro.mjs   (run from repo root or worker/)

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const WORKERS = 3
const RANGE = 300
const TICKS = 500                 // repeat the loop many times to widen the race window
const MODE = process.env.MODE || 'fixed'
const wasmPath = fileURLToPath(new URL('./sim.wasm', import.meta.url))

if (isMainThread) {
	// 64 pages, matching main.mjs. Shared so all threads see the same linear memory.
	const memory = new WebAssembly.Memory({ initial: 64, maximum: 64, shared: true })
	// Independent shared histogram: hist[n] counts how many times `n` was logged.
	const hist = new Int32Array(new SharedArrayBuffer(RANGE * 4))

	const results = await Promise.all(
		Array.from({ length: WORKERS }, (_, i) =>
			new Promise((resolve, reject) => {
				const w = new Worker(fileURLToPath(import.meta.url), {
					workerData: { workerID: i + 1, memory, hist, wasmPath, mode: MODE, ticks: TICKS },
				})
				w.once('message', resolve)
				w.once('error', reject)
			})
		)
	)

	let missing = 0, wrong = 0
	for (let n = 0; n < RANGE; n++) {
		if (hist[n] === 0) missing++
		else if (hist[n] !== TICKS) wrong++
	}

	console.log(`MODE=${MODE} workers=${WORKERS} ticks=${TICKS}`)
	console.log(`numbers never logged: ${missing} / ${RANGE}`)
	console.log(`numbers logged the wrong number of times: ${wrong} / ${RANGE}`)
	const ok = missing === 0 && wrong === 0
	console.log(ok ? 'PASS: every number 0..299 was logged exactly TICKS times.'
	              : 'FAIL: shadow-stack corruption skipped or duplicated numbers.')
	process.exit(ok ? 0 : 1)
} else {
	const { workerID, memory, hist, wasmPath, mode, ticks } = workerData
	const bytes = readFileSync(wasmPath)
	const wasm = await WebAssembly.instantiate(bytes, {
		env: { memory },
		imports: {
			abort: () => { throw new Error(`abort in thread ${workerID}`) },
			_log_num: num => { Atomics.add(hist, num, 1) },
		},
	})
	const exports = wasm.instance.exports

	if (mode === 'broken') {
		// Old behaviour: bogus TLS init, no per-thread stack -> all threads share one stack.
		exports.__wasm_init_tls(workerID - 1)
	} else {
		// The fix (see sim.mjs): give each thread its own non-overlapping stack + TLS block.
		// Set the private stack FIRST, before any wasm call (incl. TLS init).
		const workerIndex = workerID - 1
		const REGION_BASE = 2 * 1024 * 1024
		const STACK_SIZE = 512 * 1024
		const align = n => (n + 15) & ~15
		const tlsSize = align(exports.__tls_size.value)
		const blockSize = tlsSize + STACK_SIZE
		const blockBase = REGION_BASE + workerIndex * blockSize
		exports.__stack_pointer.value = blockBase + blockSize
		exports.__wasm_init_tls(blockBase)
	}

	for (let t = 0; t < ticks; t++) exports.run(workerID)
	parentPort.postMessage({ workerID, done: true })
}
