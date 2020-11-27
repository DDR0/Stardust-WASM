import "../index.css"
import "../graphUi.css"

const $ = document.querySelector.bind(document)
const $$ = document.querySelectorAll.bind(document)


const updateNodeType = [
	(data, elem) => { //circle
		const circle = elem.querySelector('circle')
		circle.setAttribute('cx', data.x)
		circle.setAttribute('cy', data.y)
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
	(data, elem) => { //box
		const rect = elem.querySelector('rect')
		rect.setAttribute('x', data.x)
		rect.setAttribute('y', data.y)
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
	(data, elem) => { //lozenge
		const rect = elem.querySelector('rect')
		rect.setAttribute('x', data.x)
		rect.setAttribute('y', data.y)
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
	(data, elem) => { //text
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
]


const nodeShapeRadii = [ //circle, rectangle, lozenge, text
	18, 
	Math.sqrt(Math.pow(46/2,2) + Math.pow(23/2,2)),
	46/2,
	18
]


//Used below, values passed by reference. (aka pointer)
let graphData
let linkTemplates, nodeTemplates

export const link = newGraphData => {
	graphData = newGraphData
	linkTemplates = $$("#graph-link-templates > g")
	nodeTemplates = $$("#graph-node-templates > g")
	repaint()
}

let paintPending = false
export const repaint = () => {
	if (paintPending) { return }
	paintPending = true
	requestAnimationFrame(render)
}

const linkStateCache = []
const nodeStateCache = []
const render = ()=>{
	paintPending = false
	const nodeCount = graphData.nodes.nodeCount[0]
	const linkCount = graphData.links.linkCount[0]
	let i;
	
	while ((i = linkStateCache.length) < linkCount) {
		const domNode = linkTemplates[0].cloneNode(true)
		$('#graph-layer-links').appendChild(domNode)
		linkStateCache.push({
			domNode,
			visible: -1,
			alive: -1,
		})
	}
	
	while ((i = nodeStateCache.length) < nodeCount) {
		const dummyNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
		$('#graph-layer-nodes').appendChild(dummyNode)
		nodeStateCache.push({
			lastShape: -1,
			domNode: dummyNode, //placeholder, gets replaced during initial hydration
			visible: -1,
			alive: -1,
		})
	}
	
	for (i = 0; i < linkCount; i++) {
		const data = graphData.link(i)
		const cached = linkStateCache[i]
		const link = cached.domNode
		
		const alive = (data.lflags & 1)
		if (alive !== cached.alive) {
			cached.alive = alive
			link.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = alive
		}
		if (!alive) { continue } //We're dead, hidden, don't bother with any further updates.
		
		const visible = alive //TODO DDR 2020-11-23: Add view rect intersection.
		if (visible !== cached.visible) {
			link.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = visible
		}
		
		//Set line position.
		const LINE_GAP = 0
		const { x:nodesX, y:nodesY } = graphData.nodes
		const linkLenX = nodesX[data.from]-nodesX[data.to]
		const linkLenY = nodesY[data.from]-nodesY[data.to]
		const linkLen = Math.sqrt(Math.pow(linkLenX, 2) + Math.pow(linkLenY, 2))
		const llenFrom = nodeShapeRadii[graphData.nodes.flags[data.from]>>3&3]
		const llenTo   = nodeShapeRadii[graphData.nodes.flags[data.to  ]>>3&3]
		const pathd = `M${//SVG path - move to x/y, line to x/y.
			nodesX[data.from] - linkLenX/linkLen * (llenTo  +LINE_GAP)
		},${
			nodesY[data.from] - linkLenY/linkLen * (llenTo  +LINE_GAP)
		}L${
			nodesX[data.to  ] + linkLenX/linkLen * (llenFrom+LINE_GAP)
		},${
			nodesY[data.to  ] + linkLenY/linkLen * (llenFrom+LINE_GAP)
		}`
		const paths = link.querySelectorAll('path') //set path of background line + margin line
		paths[0].setAttribute('d', pathd)
		paths[1].setAttribute('d', pathd)
		
		//Set text position.
		const text = link.querySelector('text')
		text.setAttribute('x', (nodesX[data.from]+nodesX[data.to])/2)
		text.setAttribute('y', (nodesY[data.from]+nodesY[data.to])/2)
		text.textContent = data.label
	}
	
	for (i = 0; i < nodeCount; i++) {
		const data = graphData.node(i)
		const cached = nodeStateCache[i]
		
		const alive = (data.flags & 1)
		if (alive !== cached.alive) {
			cached.alive = alive
			cached.domNode.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = alive
		}
		if (!alive) { continue } //We're dead, hidden, don't bother with any further updates.
		
		const visible = alive //TODO DDR 2020-11-23: Add view rect intersection.
		if (visible !== cached.visible) {
			cached.domNode.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = visible
		}
		
		const shape = data.flags>>3&3
		if (shape !== cached.lastShape) {
			cached.lastShape = shape
			const newNode = nodeTemplates[shape].cloneNode(true)
			$('#graph-layer-nodes').replaceChild(newNode, cached.domNode)
			cached.domNode = newNode
		}
		
		updateNodeType[shape](data, cached.domNode)
	}
}