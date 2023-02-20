import {bindWorldToDisplay} from './ui.mjs'

const showErrorMessage = message => 
	document.body.innerHTML = `
		<div>
			<h1>Internal Failure</h1>
			<p>${message}</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`

if (!window.SharedArrayBuffer) {
	showErrorMessage("Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?")
	throw new ReferenceError('SharedArrayBuffer is not defined.')
}

if (!Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2023-01-28.
	console.warn('Atomics.waitAsync not available; glitching may occur when resized.')
}

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const gameDisplay = $("#stardust-game")

const defaultHardwareConcurrency = 4;
const reservedCores = 2; //One for main thread, one for the render thread; the rest are used for processing. This means at minimum we run with 3 threads, even if we're on a single-core CPU.
//Note: Safari doesn't support hardwareConcurrency as of 2022-06-09.
const availableCores = 
	(+localStorage.coreOverride)
	|| Math.max(//Available cores for _processing,_ at least 1.
		1, 
		(navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores
	);

const maxScreenRes = Object.freeze({ x: 3840, y: 2160 }) //4k resolution, probably no sense reserving more memory than that especially given we expect to scale up our pixels.
const totalPixels = maxScreenRes.x * maxScreenRes.y
const renderBuffer = new Uint8Array(new SharedArrayBuffer(totalPixels * Uint8Array.BYTES_PER_ELEMENT * 3)) //rgb triplets (no a?) - drawn to canvas to render the game

//Could use a double-buffer system, but we would have to copy everything from one buffer to the other each frame. Benefit: no tearing.
const world = Object.freeze({
	__proto__: null,
	lock:              new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)), //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	tick:              new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)), //Current global tick.
	
	workersRunning:    new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)), //Used by workers, last one to finish increments tick.
	
	bounds: Object.seal({ 
		__proto__: null,
		x:             new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)), 
		y:             new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)),
	}),
	wrappingBehaviour: new Uint8Array(new SharedArrayBuffer(4 * Uint8Array.BYTES_PER_ELEMENT)), //top, left, bottom, right: Set to particle type 0 or 1.
	
	particles: Object.freeze({
		__proto__: null,
		lock:        new Int32Array    (new SharedArrayBuffer(totalPixels * Int32Array.    BYTES_PER_ELEMENT)), //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker
		type:        new Uint8Array    (new SharedArrayBuffer(totalPixels * Uint8Array.    BYTES_PER_ELEMENT)),
		tick:        new Uint8Array    (new SharedArrayBuffer(totalPixels * Uint8Array.    BYTES_PER_ELEMENT)), //Used for is_new_tick. Stores whether last tick processed was even or odd. If this doesn't match the current tick, we know to advance the particle simulation one step.
		stage:       new Uint8Array    (new SharedArrayBuffer(totalPixels * Uint8Array.    BYTES_PER_ELEMENT)), //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
		initiative:  new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)), //Faster particles get more initiative to spend moving around.
		rgba:        new Uint32Array   (new SharedArrayBuffer(totalPixels * Uint32Array.   BYTES_PER_ELEMENT)),
		velocity: {
			__proto__: null,
			x:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
			y:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		},
		subpixelPosition: { 
			__proto__: null,
			x:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)), //Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
			y:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		},
		mass:        new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		temperature: new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)), //Kelvin
		scratch1:    new BigUint64Array(new SharedArrayBuffer(totalPixels * BigUint64Array.BYTES_PER_ELEMENT)), //internal state for the particle
		scratch2:    new BigUint64Array(new SharedArrayBuffer(totalPixels * BigUint64Array.BYTES_PER_ELEMENT)),
	})
})

window.world = world //Enable easy script access for debugging.

Array.prototype.fill.call(world.wrappingBehaviour, 1) //0 is air, 1 is wall. Default to wall. See particles.rs:hydrate_with_data() for the full list.


///////////////////////
//  Set up workers.  //
///////////////////////

const pong = val => { console.log('pong', val) }

const callbacks = { ok: Object.create(null), err: Object.create(null) } //Default, shared callbacks.
callbacks.ok.hello = pong
//callbacks.ok.update = graphUi.repaint
callbacks.ok.pong = pong
callbacks.ok.reload = ()=>{
	console.info('Reload requested from worker.')
	window.location.reload()
}

const pendingSimulationCores = Array(availableCores).fill().map((_,i) =>
	new Promise(resolve => {
		const worker = new Worker('worker/sim.mjs', {type:'module'})
		worker.addEventListener('message', onLoaded)
		function onLoaded({data}) {
			if (data[0] !== 'loaded') throw new Error(`Bad load; got unexpected message '${data[0]}'.`)
			console.info(`loaded sim core ${i}`)
			worker.removeEventListener('message', onLoaded)
			worker.postMessage(['start', i, world])
			resolve(worker)
		}
	})
)

//Wait for our compute units to become available.
const simulationCores = await Promise.allSettled(pendingSimulationCores)
	.then(results => results
		.filter(result => result.status === "fulfilled")
		.map(result => result.value))

console.info(`Loaded ${simulationCores.length}/${pendingSimulationCores.length} logic cores.`)
if (!simulationCores.length) {
	showErrorMessage("Could not load any simulation cores. This means the game has nothing to run on, and won't work. Perhaps try another browser?")
	throw new Error('Failed to load any simulation cores.')
}



////Poke shared memory worker threads are waiting on, once per frame.
//(function advanceTick() {
//	if (!Atomics.load(world.workersRunning, 0)) { 
//		Atomics.add(world.tick, 0, 1)
//		Atomics.notify(world.tick, 0)
//		//console.log('incremented frame')
//	} else {
//		//console.log('missed frame')
//	}
//	requestAnimationFrame(advanceTick)
//})()


/*
const renderCore = await pendingRenderCore
renderCore.postMessage({type:'hello', data:[]})
renderCore.postMessage({type:'bindToData', data:[world]})

//Rendering works by passing around a typed array buffer, so that we can render
//the particles in a worker and then efficiently draw the resulting image in the
//main thread.

drawFrame.context = $("canvas.main").getContext('2d')
function drawFrame(buffer, width, height) {
	//If we save the ImageData after transferring the backing array buffer out, transferring the buffer back to this thread doesn't "put it back" into the ImageData's buffer. And since we can't assign it to buffer, we have to recreate the object. Seems fairly light-weight, at least, since we can create the new object with the old buffer.
	//Anyway, first step, we draw the image data. This way, we don't drop frames when we're resizing, even if we do lag a bit.
	drawFrame.context.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
	
	//Regenereate the buffer here if our canvas has changed size. We could use a ResizeObserver, but we'd have to check here anyway since we never *store* the buffer in a permanent variable - it only ever lives in function args, since ownership is passed around between the main and render threads.
	const canvas = drawFrame.context.canvas;
	if (canvas.width != width || canvas.height != height) {
		({width, height} = canvas)
		buffer = new ArrayBuffer(4*width*height)
	}
	
	//I'm not sure about the placement of this RAF - should we kick off rendering at the end of the current frame and draw it immediately on the next, as opposed to kicking off the render and hoping it returns before the next frame? I think we could also put it in the web-worker, but that wouldn't really help us here.
	requestAnimationFrame(() => {
		renderCore.postMessage(
			{ type: 'renderInto', data: [buffer, width, height] },
			[ buffer ],
		)
		
		if (buffer.byteLength && !drawFrame.hasThrownTransferError) {
			drawFrame.hasThrownTransferError = true
			console.error('Failed to transfer image data, falling back to expensive copy operation.')
		}
	})
}

drawFrame(new ArrayBuffer(4), 1, 1) //Kick off the render loop.

console.info(`Loaded render core.`)

bindWorldToDisplay(world, gameDisplay, {
	dot:  (...args) => renderCore.postMessage({type:'drawDot',  data:args}),
	line: (...args) => renderCore.postMessage({type:'drawLine', data:args}),
	rect: (...args) => renderCore.postMessage({type:'drawRect', data:args}),
	fill: (...args) => renderCore.postMessage({type:'drawFill', data:args}),
})

console.info('Bound UI elements.')
*/
