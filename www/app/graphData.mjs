if (!window.SharedArrayBuffer) {
	document.body.innerHTML = "<div><h1>Error</h1><p>Your browser does not support shared array buffers, which are required by this graphing software.</p></div>"
	throw new ReferenceError('SharedArrayBuffer is not defined')
} else {
}

export const graphData = Object.freeze((()=>{
	//Nodes and links, stored in sharable data structures for web-worker
	//interop to avoid copying memory.
	
	//Node-A Node-B Weight Label shape=box color=blue bold=yes fixed=yes image=https://placekitten.com/80/80
	
	//Debugging flags.
	const LOG_NODE_MUTATIONS = false
	const LOG_LINK_MUTATIONS = false
	
	//Limits, basically how much memory to allocate.
	const MAX_NODES = Math.pow(2,16) //Largely arbitrary; we allocate the array buffers large enough for this but they don't seem to take up memory until we use them. (This plays well with virtual memory?) I expect we'll start to chug drawing and optimizing at around a thousand elements anyway, well under this limit.
	const MAX_LINKS_PER_NODE = 32
	const MAX_LINKS = Math.pow(2,16)
	
	//Node Properties:
	const positionX  = new Float32Array(new SharedArrayBuffer(MAX_NODES * Float32Array.BYTES_PER_ELEMENT)) //num, location
	const positionY  = new Float32Array(new SharedArrayBuffer(MAX_NODES * Float32Array.BYTES_PER_ELEMENT)) //num, location
	const flags      = new Uint8Array(new SharedArrayBuffer(MAX_NODES * Uint8Array.BYTES_PER_ELEMENT)) //1 bool is alive, 2 bool is immovable? 4 bool is bold? 8..256 are unused
	const links      = new Uint16Array(new SharedArrayBuffer(MAX_NODES * MAX_LINKS_PER_NODE * Uint16Array.BYTES_PER_ELEMENT)) //2D array of link indices this element has
	const numLinks   = new Uint8Array(new SharedArrayBuffer(MAX_NODES * Uint8Array.BYTES_PER_ELEMENT)) //how many links this element has
	const nameId     = [] //str, node ids
	const colour     = [] //str, css colour
	const bgImage    = [] //str, [data?] url
	
	//Link Properties:
	const from   = new Uint16Array(new SharedArrayBuffer(MAX_LINKS * Uint16Array.BYTES_PER_ELEMENT)) //num, index of linked-from node
	const to     = new Uint16Array(new SharedArrayBuffer(MAX_LINKS * Uint16Array.BYTES_PER_ELEMENT)) //num, index of linked-to node. (The arrow points this way.)
	const label  = [] //str, name, NOT an ID unlike nodes
	const weight = new Float32Array(new SharedArrayBuffer(MAX_LINKS * Float32Array.BYTES_PER_ELEMENT)) //num, link weight (1 is "normal")
	const lflags = new Uint8Array(new SharedArrayBuffer(MAX_LINKS * Uint8Array.BYTES_PER_ELEMENT)) //1 bool is alive
	
	//Lookups
	const indexOf    = Object.create(null) //{label->index} map
	const free       = { nodes:[], links:[] } //[indices] which are not alive, ie, can be re-used.
	const nodeCount  = new Uint16Array(new SharedArrayBuffer(Uint16Array.BYTES_PER_ELEMENT)) //How many nodes exist, as an optimization to avoid processing all of them. (note: 1 element long, because only array buffers can be shared and we want to keep consistency with the rest of this interface.)
	const linkCount  = new Uint16Array(new SharedArrayBuffer(Uint16Array.BYTES_PER_ELEMENT)) //How many links exist.
	
	const dump = action => {
		console.groupCollapsed(action)
		console.table({
			positionX: positionX.subarray(0, nameId.length),
			positionY: positionY.subarray(0, nameId.length),
			flags: flags.subarray(0, nameId.length),
			//links?? 2d can't show well.
			numLinks: numLinks.subarray(0, nameId.length),
			nameId: nameId,
			colour: colour,
			bgImage: bgImage,
		})
		console.table({
			from: from.subarray(0, label.length),
			to: to.subarray(0, label.length),
			label: label,
			weight: weight.subarray(0, label.length),
			lflags: lflags.subarray(0, label.length),
		})
		console.log(indexOf, free)
		console.groupEnd()
	}
	(LOG_NODE_MUTATIONS || LOG_LINK_MUTATIONS) && dump('initialized')
	
	
	
	//Update a node, creating it if necessary.
	//Looks up id from name and name from id. If both are passed, name is updated.
	const setNode = props => {
		switch (true) {
			case props.name === '':
				throw new TypeError('Set: Name must have content.')
			case (props.index === undefined) && !props.name:
				throw new TypeError('Set: Missing or invalid index, missing name. (What node should be set?)')
			case (props.index === undefined) && !!props.name: //Add or create by name. First check if name exists. If not, check if we've got any nodes in the graveyard, and if not summon a new node.
				props.index = indexOf[props.name] ?? free.nodes.pop() ?? nameId.length
				break;
			case (!props.name) //Look name up from index.
				&& !(props.name=nameId[props.index]): //If the name isn't in the index, then we must be creating the node, and name is required. (This logic should come last as assignment is done in the conditional.)
				throw new TypeError('Missing name for initial node set.')
		}
		
		if (typeof props.shape === 'number' && (props.shape < 0 || props.shape > 3)) {
			throw new RangeError('Missing name for initial node set.')
		}
		
		const index = props.index
		indexOf[props.name] = index //Populate indexOf map if we're creating.
		
		positionX[index] = props.x ?? 0
		positionY[index] = props.y ?? 0
		Atomics.store(flags, index, 0
			| true<<0 //is alive - true, because we're doing that here, and we just filled all the shared memory the web worker can see.
            | props.fixed<<1 || flags[index] & 1<<1 //node is fixed, it doesn't move
            | props.bold<<2 || flags[index] & 1<<2 //node has the bold (selected?) appearance
            | (props.shape??0)<<3 //2-wide, node's shape (0-3)
            //3 bits left, 1<<5, 1<<6, 1<<7. Start from 7 in case we want to have more shapes?
		)
		nameId[index] = props.name
		
		colour[index] = props.color ?? 'white'
		bgImage[index] = props.image ?? ''
		
		Atomics.store(nodeCount, 0, nameId.length)
		
		LOG_NODE_MUTATIONS && dump(`set ${props.name}`)
		return index //id (index) of newly entered thing
	}
	
	const removeNode = ({index=-1, name=''}) => {
		if (index < 0 && !name) { throw new TypeError('Missing index or name to remove.') }
		if (index < 0) {
			index = indexOf[name]
		} else {
			name = nameId[index]
		}
		if (index === undefined) { throw new TypeError('Bad index or name to remove.') }
		
		//Mark the object as dead and then move it to the graveyard.
		//First, don't have the worker do any more processing on this
		//index. Note that it *may* *continue* processing this index,
		//however. This should be safe enough in practise, since it's just
		//moving around x and y and we set that on resurrection.
		Atomics.store(flags, index, 0)
		free.nodes.push(index)
		delete indexOf[name]
		
		//Remove this entry from the reference of any objects linked to it.
		links.subarray(
			index*MAX_LINKS_PER_NODE, 
			index*MAX_LINKS_PER_NODE+numLinks[index]
		).forEach(removeLink)
		
		//Clear node.
		numLinks[index] = 0
		nameId[index] = ''
		colour[index] = 'white'
		bgImage[index] = ''
		
		LOG_NODE_MUTATIONS && dump(`removed ${name}`)
	}
	
	const setLink = (A, B, labelId='', newWeight=1) => {
		if (typeof A === 'string') { A = indexOf[A] }
		if (typeof B === 'string') { B = indexOf[B] }
		
		let link = links.subarray(
			A*MAX_LINKS_PER_NODE, 
			A*MAX_LINKS_PER_NODE+numLinks[A]
		).find(link => from[link] === A && to[link] === B)
		
		if (link === undefined) {
			//Add new link, possibly resurrecting one from the graveyard.
			link = free.links.pop() ?? label.length
			
			from[link] = A; to[link] = B
			links[A*MAX_LINKS_PER_NODE + numLinks[A]++] = link //Add us to nodes' links.
			links[B*MAX_LINKS_PER_NODE + numLinks[B]++] = link
		}
		
		label[link] = labelId
		weight[link] = newWeight
		Atomics.store(lflags, link, 1)
		Atomics.store(linkCount, 0, label.length)
		
		LOG_LINK_MUTATIONS && dump(`linked ${nameId[A]} → ${nameId[B]}`)
		return link
	}
	
	const removeLink = link => {
		if (typeof link !== 'number') { throw new TypeError("Unlink requires a numeric link ID.") }
		
		Atomics.store(lflags, link, 0) //do this first
		free.links.push(link)
		
		//Copy the last link of node's links into whatever slot we are,
		//then decrement node's link count to "forget" it. (The list of
		//links a node has needs to be contiguous, as we don't maintain
		//a free list for each node.)
		const A = from[link]
		links[ //find current link being deleted in node A
			A*MAX_LINKS_PER_NODE +
			links.subarray(A*MAX_LINKS_PER_NODE, A*MAX_LINKS_PER_NODE+numLinks[A])
				.indexOf(link)
		] = links[ //and copy the last link in node A over it
			A*MAX_LINKS_PER_NODE+(--numLinks[A]) //and decrement the number of links
		]
		
		const B = to[link]
		links[ //find current link being deleted in node B
			B*MAX_LINKS_PER_NODE +
			links.subarray(B*MAX_LINKS_PER_NODE, B*MAX_LINKS_PER_NODE+numLinks[B])
				.indexOf(link)
		] = links[ //and copy the last link in node B over it
			B*MAX_LINKS_PER_NODE+(--numLinks[B]) //and decrement the number of links
		]
		
		LOG_LINK_MUTATIONS && dump(`unlinked ${nameId[A]} → ${nameId[B]}`)
	}
	
	return {
		//Expose methods for working with the graph data.
		setNode, removeNode, setLink, removeLink,
		
		//Expose the linear graph data for processing.
		nodes: {
			get x() { return positionX },
			get y() { return positionY },
			get flags() { return flags },
			get links() { return links },
			get numLinks() { return numLinks },
			get name() { return nameId },
			get colour() { return colour },
			get bgImage() { return bgImage },
			get nodeCount() { return nodeCount },
		},
		
		//And, nicely, for rendering.
		node: index => ({
			get x() { return positionX[index] },
			get y() { return positionY[index] },
			get flags() { return flags[index] },
			get links() { return links.subarray(index*MAX_LINKS_PER_NODE, index*MAX_LINKS_PER_NODE+numLinks[index]) },
			get name() { return nameId[index] },
			get colour() { return colour[index] },
			get bgImage() { return bgImage[index] },
		}),
		
		
		links: {
			get from() { return from },
			get to() { return to },
			get label() { return label },
			get weight() { return weight },
			get lflags() { return lflags },
			get linkCount() { return linkCount },
		},
		
		link: index => ({	
			get from() { return from[index] },
			get to() { return to[index] },
			get label() { return label[index] },
			get weight() { return weight[index] },
			get lflags() { return lflags[index] },
		}),
	}
})())