"use strict"

if (!window.SharedArrayBuffer) {
	document.body.innerHTML = `
		<div>
			<h1>Software Failure</h1>
			<p>Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?</p>
			<p>Guru Meditation ${(crossOriginIsolated << 1) | (isSecureContext << 0)}</p>
		</div>
	`
	console.log();
	throw new ReferenceError('SharedArrayBuffer is not defined')
}

//import { graphData } from './graphData.mjs'
import * as ui from './ui.mjs'

const ice = Object.freeze
const MAX_SCREEN_RES = ice({ X: 3840, Y: 2160 })

const returnBuffer = new Uint8Array(new SharedArrayBuffer(
	MAX_SCREEN_RES.X * MAX_SCREEN_RES.Y * Uint8Array.BYTES_PER_ELEMENT
))

const callbacks = { ok: Object.create(null), err: Object.create(null) } //Default, shared callbacks.
callbacks.ok.hello = ui.pong
//callbacks.ok.update = graphUi.repaint
callbacks.ok.pong = ui.pong

const reservedCores = 2; //One for main thread, one for the render thread.
const availableCores = Math.max(1, (navigator.hardwareConcurrency || 4) - reservedCores); //Safari doesn't support hardwareConcurrency as of 2022-06-09.

const renderCore = wrapForCallbacks(
	new Worker('./renderWorker.js'),
	{
		err: { ...callbacks.err }, 
		ok: {
			...callbacks.ok,
			ready: ()=>{
				graphOptimizer.postMessage({type:'hello', data:[]});
			},
		},
	}
)

let logicCores = Array(availableCores).fill().map((_,i)=>{
	return new Promise((resolve, reject) => {
		const graphOptimizer = wrapForCallbacks(
			new Worker('./logicWorker.js'),
			{
				err: { ...callbacks.err }, 
				ok: {
					...callbacks.ok,
					ready: ()=>{
						resolve(graphOptimizer)
						
						//graphOptimizer.postMessage({type:'useGraphData', data:[[
						//	graphData.nodes.x,
						//	graphData.nodes.y,
						//	graphData.nodes.flags,
						//	graphData.nodes.links,
						//	graphData.nodes.numLinks,
						//	graphData.nodes.nodeCount,
						//	graphData.links.from,
						//	graphData.links.to,
						//	graphData.links.lflags,
						//	graphData.links.linkCount,
						//]]})
						graphOptimizer.postMessage({type:'run'})
						graphOptimizer.postMessage({type:'hello', data:[]});
					}
				}
			},
		)
	});
})

logicCores = await Promise.allSettled(logicCores).then(results => 
	results.filter(result => result.status === "fulfilled"))

console.info(`Loaded ${logicCores.length}/${availableCores} logic cores.`)

function wrapForCallbacks(worker, callbacks) {
	//Wrap a worker for our error-handling callback style, ie, callbacks.ok.whatever = ()=>{}.
	
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