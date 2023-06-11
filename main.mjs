//Let's count to 300. We'll have three web workers, each taking ⅓rd of the task. 0-100, 100-200, 200-300...

//First, allocate some shared memory. (The original task wants to share some values around.)
export const memory = (()=>{
	const wasmPageSize = 65535
	return new WebAssembly.Memory({
		initial: Math.ceil(1500000/wasmPageSize),
		maximum: Math.ceil(1500000/wasmPageSize),
		shared: true,
	})
})()

//Then, allocate the data views into the memory.
//This is shared memory which will get updated by the worker threads, off the main thread.
export const world = {
	__proto__: null,
	globalTick: new Int32Array(memory.buffer, 1200000, 1), //Current global tick. Increment to tell the workers to count up in scratchA!
}

//Load a core and send the "start" event to it.
const startAWorkerCore = coreIndex => {
	const worker = new Worker('worker/sim.mjs', {type:'module'})
	;['start', coreIndex+1, memory, world].forEach(arg => worker.postMessage(arg)) //Marshal the "start" message across multiple postMessages because of the following bugs: 1. Must transfer memory BEFORE world. https://bugs.chromium.org/p/chromium/issues/detail?id=1421524 2. Must transfer world BEFORE memory. https://bugzilla.mozilla.org/show_bug.cgi?id=1821582
}

//Now, let's start some worker threads! They will work on different memory locations, so they don't conflict.
startAWorkerCore(0) //works fine
startAWorkerCore(1) //breaks counting - COMMENT THIS OUT TO FIX COUNTING
startAWorkerCore(2) //breaks counting - COMMENT THIS OUT TO FIX COUNTING


//Advance the simulation one step. (Trigger the worker threads to do their counting.)
const tick = () => {
	Atomics.add(world.globalTick, 0, 1)
	Atomics.notify(world.globalTick, 0)
}

//Run the simulation thrice. Each thread should now print a hundred numbers in order, thrice.
//For thread 1, it should print 0, then 1, then 2, etc. up to 99.
//Thread 2 should run from 100 to 199, and thread 3 200 to 299.
//But when they're run simultaneously, all three threads seem to use the same counter.

setTimeout(tick, 500)
setTimeout(tick, 700)
setTimeout(tick, 900)