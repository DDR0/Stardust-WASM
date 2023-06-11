//Let's count to 300. We'll have three web workers, each taking ⅓rd of the task. 0-100, 100-200, 200-300...

//First, allocate some shared memory. (The original task wants to share some values around.)
const memory = new WebAssembly.Memory({
	initial: 23,
	maximum: 23,
	shared: true,
})

//Then, allocate the data views into the memory.
//This is shared memory which will get updated by the worker threads, off the main thread.
const world = {
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


//Run the simulation thrice. Each thread should print a hundred numbers in order, thrice.
//For thread 1, it should print 0, then 1, then 2, etc. up to 99.
//Thread 2 should run from 100 to 199, and thread 3 200 to 299.
//But when they're run simultaneously, all three threads seem to use the same counter.
setTimeout(tick, 500)
setTimeout(tick, 700)
setTimeout(tick, 900)
function tick() {
	Atomics.add(world.globalTick, 0, 1)
	Atomics.notify(world.globalTick, 0)
}