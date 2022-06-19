//#![no_std]
use wasm_bindgen::prelude::*;

mod utils;
mod rand;
mod particle;

use rand::Rand;
use particle::Particle;





#[wasm_bindgen]
pub fn init() { utils::init() }

#[wasm_bindgen]
pub fn hello() -> f32 {
	return 42.0;
}

#[wasm_bindgen]
pub fn process_particle(world: &JsValue, thread_id: i32, x: i32, y: i32) -> f64 {
	const PARTICLE_PROCESSED: f64 = 1.0;
	const PARTICLE_UNCHANGED: f64 = 0.0;
	
	//console::log_1(&"Hello 1".into());
	
	let p = Particle::new(world, thread_id, x, y);
	if p.is_none() {
		//Object was locked; don't process it.
		return PARTICLE_UNCHANGED; 
	}
	let p = p.unwrap();
	
	
	let mut rng = Rand::new(5);
	rng.float();
	
	
	return PARTICLE_UNCHANGED;
}


/*
#[wasm_bindgen]
pub fn optimize_graph(
	x: Float32Array,
	y: Float32Array,
	flags: Uint8Array,
	_links: Uint16Array,
	_num_links: Uint8Array,
	node_count: Uint16Array,

	//Links
	from: Uint16Array,
	to: Uint16Array,
	_lflags: Uint8Array,
	link_count: Uint16Array,
) {
	//console::log_1(&"optimize".into())
	//Two-sweep system - first, sum the forces on each node.
	//This could really stand to be accelerated by a b-tree or something, but since we've put it in a web worker we can just ... eat the cost for now.
	
	#[derive(Clone, Copy)]
	struct NodeForces {
		x: f32, //vector magnitudes
		y: f32,
	}
	
	static mut NODE_FORCES: [NodeForces; MAX_NODES] = [NodeForces{x:0.0, y:0.0}; MAX_NODES];
	
	unsafe { //We reference NODE_FORCES a lot, so just wrap the entire thing. >_<
		//1. for each node, filter to find probable nodes in range and calculate the node expansion forces into NODE_FORCES
		for i in 0..node_count.get_index(0) as u32 {
			let i_ = i as usize;
			NODE_FORCES[i_].x = 0.0; //Unweight the force vector and zero it so we can just iterate through in the set loop.
			NODE_FORCES[i_].y = 0.0;
			if flags.get_index(i)&0b11 != 0b01 { continue } //Skip moving dead or frozen source node.
			for j in 0..node_count.get_index(0) as u32 {
				if i == j { continue } //skip self
				if flags.get_index(j)&0b1 != 0b1 { continue } //Skip dead nodes.
				if (x.get_index(i) - x.get_index(j)).abs() + PADDING >= IDEAL_NODE_DISTANCE //Cheap square test. π/4=78% accurate!
				|| (y.get_index(i) - y.get_index(j)).abs() + PADDING >= IDEAL_NODE_DISTANCE { continue } //Skip distant nodes.
				
				//calculate expansion force - it's a cold, lonely universe
				let mut len_x = x.get_index(i) - x.get_index(j);
				let mut len_y = y.get_index(i) - y.get_index(j);
				if len_x == 0.0 { len_x = ((i%2>>0) as f32-0.5)/10.0 } //Avoid 0 distances resulting in NaN.
				if len_y == 0.0 { len_y = ((i%4>>1) as f32-0.5)/10.0 }
				let len = (len_x.powf(2.0) + len_y.powf(2.0)).sqrt(); //a²+b²=c²
				if len + PADDING >= IDEAL_NODE_DISTANCE { continue }
				
				//TODO: Weight movement that would snap to the ideal distance heavier than other weight.
				NODE_FORCES[i_].x += len_x/len * (len-IDEAL_NODE_DISTANCE);
				NODE_FORCES[i_].y += len_y/len * (len-IDEAL_NODE_DISTANCE);
			}
		}
		
		//2. for each linked node, add the node contraction forces into NODE_FORCES.
		for link in 0..link_count.get_index(0) as u32 {
			let i = from.get_index(link) as u32;
			let j = to.get_index(link) as u32;
			let i_ = i as usize;
			let j_ = j as usize;
			
			let len_x = x.get_index(i) - x.get_index(j);
			let len_y = y.get_index(i) - y.get_index(j);
			let len = (len_x.powf(2.0) + len_y.powf(2.0)).sqrt(); //a²+b²=c²
			if len - PADDING <= IDEAL_NODE_DISTANCE { continue }
			
			//TODO: Weight movement that would snap to the ideal distance heavier than other weight.
			if flags.get_index(i)&0b11 == 0b01 { //Skip dead or frozen source node.
				NODE_FORCES[i_].x += len_x/len * (len-IDEAL_NODE_DISTANCE);
				NODE_FORCES[i_].y += len_y/len * (len-IDEAL_NODE_DISTANCE);
			}
			
			if flags.get_index(j)&0b11 == 0b01 {
				NODE_FORCES[j_].x -= len_x/len * (len-IDEAL_NODE_DISTANCE);
				NODE_FORCES[j_].y -= len_y/len * (len-IDEAL_NODE_DISTANCE);
			}
		}
		
		//3. for each node, move by NODE_FORCES
		//Note that if the node has moved while were were calculating this step, the motion will be retained but the velocity will be incorrect for one frame.
		for i in 0..node_count.get_index(0) as u32 {
			x.set_index(i, x.get_index(i) - (NODE_FORCES[i as usize].x / (SLOWDOWN_FACTOR/2.0) ));
			y.set_index(i, y.get_index(i) - (NODE_FORCES[i as usize].y / (SLOWDOWN_FACTOR/2.0) ));
		}
	}
}
*/

//console::log_1(&format!("dbg: {:}→{:} {:?}", i,j, &NODE_FORCES[i_]).into());