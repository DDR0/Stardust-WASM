//Error preamble.
const showErrorMessage = message => 
	document.body.innerHTML = `
		<div>
			<h1>Internal Failure</h1>
			<p>${message}</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`

if (!window.isSecureContext) {
	showErrorMessage("This website was not served in a secure context, which is required by <em>Stardust</em>. This is likely the result of a server misconfiguration.")
}

if (!window.SharedArrayBuffer) {
	showErrorMessage("Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?")
	throw new ReferenceError('SharedArrayBuffer is not defined.')
}

if (!Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2023-01-28.
	console.warn('Atomics.waitAsync is not available; glitching may occur when resized.')
}


//Actual start of logic.
import {bindDisplayTo} from './ui.mjs'
import {world, memory, maxWorldSize, workersAreRunning} from './world.mjs'

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const canvas = $("#stardust-game canvas.main")

const defaultHardwareConcurrency = 4;
const reservedCores = 2; //One for main thread, one for the render thread; the rest are used for processing. This means at minimum we run with 3 threads, even if we're on a single-core CPU.
//Note: Safari doesn't support hardwareConcurrency as of 2022-06-09.
const availableCores = Math.min(256, //max number of cores we support - I recognise this is very ambitious, it should probably be lowered to reduce memory contention on the high end once if we can find a suitable test rig.
	(+localStorage.coreOverride)
	|| Math.max(//Available cores for _processing,_ at least 1.
		1, 
		(navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores
	)
);

world.wrappingBehaviour.fill(1) //0 is air, 1 is wall, etc. Default to wall.
//world.simulationWindow.set([0, 0, canvas.clientWidth, canvas.clientHeight])
world.totalWorkers[0] = availableCores



///////////////////////
//  Set up workers.  //
///////////////////////

const simulationCores = new Array(availableCores).fill().map((_, coreIndex) => {
	const coreNumber = coreIndex+1 //Sim worker IDs start at 1. Check the definition of world.locks for more details.
	const worker = new Worker('worker/sim.mjs', {type:'module'})
	//worker.addEventListener('error', err => console.error(`sim ${coreNumber}:`, err))
	//worker.addEventListener('messageerror', err => console.error(`send ${coreNumber}:`, err))
	worker.addEventListener('message', msg => console.log(`sim ${coreNumber}:`, msg))
	
	//Marshal the "start" message across multiple postMessages because of the following bugs: [Adu1bZ]
	//	- Must transfer memory BEFORE world. https://bugs.chromium.org/p/chromium/issues/detail?id=1421524
	//	- Must transfer world BEFORE memory. https://bugzilla.mozilla.org/show_bug.cgi?id=1821582
	;['start', coreNumber, memory, world]
		.forEach(arg => worker.postMessage(arg))
	
	console.info(`Initialised sim core ${coreNumber}/${availableCores}.`)
	
	return worker
})


const simulate = (()=>{
	let ticker = 0
	const loop = ()=>{
		simulate.tick()
		ticker = requestAnimationFrame(loop)
	}
	
	return Object.freeze({
		tick: () => {
			if (workersAreRunning()) {
				console.info('dropped frame')
				return 0
			} else {
				//console.info('incremented frame')
				world.workerStatuses.fill(1, 0, world.totalWorkers[0])
				Atomics.add(world.globalTick, 0, 1)
				Atomics.notify(world.globalTick, 0)
				return world.globalTick[0]
			}
		},
		
		pause: () => ticker &= cancelAnimationFrame(ticker), //pause twice is fine,
		play: () => ticker ||= requestAnimationFrame(loop),  //but don't start twice
	})
})()
simulate.tick()

if (localStorage.devMode) {
	window.simulate = simulate
}



{
	//Flip the colours of the particles to the canvas.
	const context = canvas.getContext('2d')
	let buffer = new Uint8ClampedArray(0)
	requestAnimationFrame(function drawFrame() {
		const [x1, y1, x2, y2] = world.simulationWindow
		const {y: worldWidth} = maxWorldSize
		
		const outputWidth  = x2-x1 || 1,
		      outputHeight = y2-y1 || 1
		
		//Try to avoid GC pressure by reusing the output buffer.
		//The buffer for an ImageData must be exactly the right length.
		const requiredBufferByteLength = 4 * outputWidth * outputHeight
		if (buffer.byteLength != requiredBufferByteLength) {
			buffer = new Uint8ClampedArray(requiredBufferByteLength)
		}
		
		//For each line of the simulation, copy the colours to a contiguous rect to draw to canvas.
		//Visually: data:image/gif;base64,R0lGODdhJQARAIABAAAAAP///ywAAAAAJQARAAACTIyPqcsGD6N8rQZgEc5rc89px6SA2gQ54cWYo+pIpaiSm9uYdwtfcoKx+SKs4gfYQxozIE9QtgvhlrRpp4WiUCtWS1e5GmWz4bI5UQAAOw==
		for (let y = 0; y < outputHeight; y++) {
			const worldLineStart = (y1+y) * worldWidth + x1
			buffer.set(
				y * outputWidth, 
				world.colours.subarray(worldLineStart, worldLineStart+outputWidth)
			)
		}
		
		//The buffer for an ImageData must be a Uint8ClampedArray with non-shared backing storage.
		context.putImageData(new ImageData(buffer, outputWidth, outputHeight), 0, 0)
		
		//I'm not sure about the placement of this RAF - should we kick off rendering at the end of the current frame and draw it immediately on the next, as opposed to kicking off the render and hoping it returns before the next frame? I think we could also put it in the web-worker, but that wouldn't really help us here. The advantage to the current way is that if an error is encountered, then we stop rendering so we can debug the error.
		requestAnimationFrame(drawFrame)
	})
}

bindDisplayTo($("#stardust-game"), {
	pause: state => paused = state ?? !paused,
	pick: (x,y) => {},
	dot:  (x,y, radius, type) => {},
	line: (x1, y1, x2, y2, radius, type) => {},
	rect: (x1, y1, x2, y2, radius, type) => {},
})

console.info('Main thread loaded.')
