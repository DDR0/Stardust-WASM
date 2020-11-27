"use strict"

import { graphData } from './graphData.mjs'
import * as graphUi from './graphUi.mjs'

//some test data
const ids = [
	graphData.setNode({x:10, y:20, name:'node 0'}),
	graphData.setNode({x:30, y:40, name:'node 1'}),
	graphData.setNode({x:50, y:60, name:'node 2'}),
	graphData.setNode({x:70, y:80, name:'node 1'}),
	graphData.setNode({x:90, y:99, name:'node 3'}),
]
console.log({ids})

const a = graphData.setLink(ids[0], ids[1], 'a')
const b = graphData.setLink('node 0', 'node 2', 'b', 2)
const c = graphData.setLink('node 1', 'node 2', 'c')
//setTimeout(()=>graphData.removeLink(a), 200)
//
//setTimeout(()=>graphData.removeNode({name:'node 2'}), 300)
//setTimeout(()=>graphData.removeNode({index:ids[2]}), 400)

setTimeout(()=>graphOptimizer.postMessage({type: 'run'}), 0)//750)


//Pass graphData to UI for display. (Communicates with web worker via shared memory in graphData.)
graphUi.link(graphData)


//Pass graphData to web worker for processing.
const callbacks = { ok: Object.create(null), err: Object.create(null) } //callbacks
callbacks.ok.hello = data => { answerBox.textContent = data }
callbacks.ok.update = graphUi.repaint

const graphOptimizer = new Worker('./worker.js');
graphOptimizer.addEventListener('message', ({'data': {type, data, error}}) => {
	if (error !== undefined && data !== undefined)
		return console.error(`malformed message '${type}', has both data and error`)
	
	const callback = 
		callbacks[error!==undefined?'err':'ok'][type]
		?? (error!==undefined 
			? console.error 
			: console.error(`unknown main event '${error!==undefined?'err':'ok'}.${type}')`) )
	callback(...(data ?? [error]))
});

callbacks.ok.ready = ()=>{
	console.log('ww ready')
	graphOptimizer.postMessage({type:'useGraphData', data:[[
		graphData.nodes.x,
		graphData.nodes.y,
		graphData.nodes.flags,
		graphData.nodes.links,
		graphData.nodes.numLinks,
		graphData.nodes.nodeCount,
		graphData.links.from,
		graphData.links.to,
		graphData.links.lflags,
		graphData.links.linkCount,
	]]})
	graphOptimizer.postMessage({type:'run'})
}