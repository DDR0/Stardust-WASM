import {bindWorldToDisplay} from './ui.mjs'

if (!window.SharedArrayBuffer) {
	document.body.innerHTML = `
		<div>
			<h1>Software Failure</h1>
			<p>Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`
	throw new ReferenceError('SharedArrayBuffer is not defined.')
}

if (!Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2022-06-12.
	console.warn('Atomics.waitAsync not available; glitching may occur when resized.')
}

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const displaySelector = "#stardust-game" //Just use the first canvas we find for now.

const defaultHardwareConcurrency = 4;
const maxHardwareConcurrency = 512; //Hopeful little number, isn't it?
const reservedCores = 2; //One for main thread, one for the render thread.
//Note: Safari doesn't support hardwareConcurrency as of 2022-06-09.
const availableCores = Math.min(Math.max( //Available cores for _processing._
	1, (navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores), maxHardwareConcurrency);

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
		lock:        new Int32Array    (new SharedArrayBuffer(totalPixels * Int32Array.    BYTES_PER_ELEMENT)), //Is this particle locked for processing? 0=no, 1=yes.
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

bindWorldToDisplay(world, $(displaySelector))


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


//Wrap a worker for our error-handling callback style, ie, callbacks.ok.whatever = ()=>{}.
function wrapForCallbacks(worker, callbacks) {
	worker.addEventListener('message', ({'data': {type, data, error}}) => {
		if (error !== undefined && data !== undefined)
			return console.error(`malformed message '${type}', has both data and error`)
		
		const callback = 
			callbacks[error!==undefined?'err':'ok'][type]
			?? (error!==undefined 
				? console.error 
				: console.error(`unknown main event '${error!==undefined?'err':'ok'}.${type}')`) )
		callback(...(data ?? [error]))
	});
	
	return worker
}


const pendingRenderCore = new Promise((resolve, reject) => {
	const worker = wrapForCallbacks(
		new Worker('./renderWorker.mjs'),
		{
			err: { ...callbacks.err }, 
			ok: {
				...callbacks.ok,
				ready: ()=>{
					resolve(worker)
				},
			},
		}
	)
})

const pendingLogicCores = Array(availableCores).fill().map((_,i)=>{
	return new Promise((resolve, reject) => {
		const worker = wrapForCallbacks(
			new Worker('./logicWorker.mjs'),
			{
				err: { ...callbacks.err }, 
				ok: {
					...callbacks.ok,
					ready: ()=>{
						resolve(worker)
						worker.postMessage({type:'hello', data:[]});
					}
				}
			},
		)
	});
})

//Wait for our compute units to become available.
const renderCore = await pendingRenderCore
const logicCores = await Promise.allSettled(pendingLogicCores)
	.then(results => results
		.filter(result => result.status === "fulfilled")
		.map(result => result.value))


logicCores.forEach((core, coreNumber, cores) => core.postMessage({
	type: 'start',
	data: [coreNumber, cores.length, world],
}))

console.info(`Loaded render core and ${logicCores.length}/${pendingLogicCores.length} logic cores.`)
if(!logicCores.length) {
	document.body.innerHTML = `
		<div>
			<h1>Software Failure</h1>
			<p>Failed to load any simulation cores. Perhaps try another browser?</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`
	throw new Error('Failed to load any simulation cores.')
}



//Poke shared memory worker threads are waiting on, once per frame.
(function advanceTick() {
	if (!Atomics.load(world.workersRunning, 0)) { 
		Atomics.add(world.tick, 0, 1)
		Atomics.notify(world.tick, 0)
		//console.log('incremented frame')
	} else {
		//console.log('missed frame')
	}
	requestAnimationFrame(advanceTick)
})()