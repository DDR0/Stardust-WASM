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


export const link = graphData => {
	const linkTemplates = $$("#graph-link-templates > g")
	const nodeTemplates = $$("#graph-node-templates > g")
	const linkStateCache = []
	const nodeStateCache = []
	
	requestAnimationFrame(function render() {
		const nodeCount = graphData.nodes.nodeCount[0]
		const linkCount = graphData.links.linkCount[0]
		let i;
		
		while ((i = linkStateCache.length) < nodeCount) {
			const domNode = linkTemplates[0].cloneNode(true)
			$('#graph-layer-links').appendChild(domNode)
			linkStateCache.push({
				lastShape: -1,
				domNode, //placeholder, gets replaced during initial hydration
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
			
			const { x:nodesX, y:nodesY } = graphData.nodes
			const pathd = `M${nodesX[data.from]},${nodesY[data.from]}L${nodesX[data.to]},${nodesY[data.to]}`
			const paths = link.querySelectorAll('path')
			paths[0].setAttribute('d', pathd)
			paths[1].setAttribute('d', pathd)
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
		
		requestAnimationFrame(render)
	})
}