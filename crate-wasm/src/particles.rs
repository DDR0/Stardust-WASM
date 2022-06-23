mod rand;
pub mod particle_data;

use web_sys::console;
use js_sys::Math;
use enum_dispatch::enum_dispatch;

use rand::Rand;
use particle_data::{new_particle_data, ParticleData, BaseParticle};

//TODO: figure out how to scope this. Can't seem to use enums with f64, impl needs a struct which then never gets constructed.
type ProcessingStatus = f64;
pub const PARTICLE_DID_PROCESSING:      ProcessingStatus = 1.0;
pub const PARTICLE_IS_WAITING:          ProcessingStatus = 0.0;
pub const PARTICLE_PROCESSING_FAILED:   ProcessingStatus = 0.0;
pub const PARTICLE_NO_PROCESS:          ProcessingStatus = 0.0;

type Weight = f64; //1 cubic meter of x at sea level, in kg.

#[derive(PartialEq)]
pub enum Phase {
	Solid,
	Liquid,
	Gas,
}


#[enum_dispatch]
pub trait Processable<'w> {
	fn base(self) -> BaseParticle<'w>;
	
	fn phase(&self) -> Phase;
	fn weight(&self) -> Option<Weight>; //No weight, object is unmovable.
	
	fn run(&mut self) -> ProcessingStatus;
}



#[derive(Debug)]
pub struct Air<'w> {
	base: BaseParticle<'w>
}

impl<'w> Processable<'w> for Air<'w> {
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Gas }
	fn weight(&self) -> Option<Weight> { Some(1.185) } //kg/m³ at sea level - steel is 7900.0
	
	fn run(&mut self) -> ProcessingStatus {
		PARTICLE_NO_PROCESS
	}
}


#[derive(Debug)]
pub struct Wall<'w> {
	base: BaseParticle<'w>
}

impl<'w> Processable<'w> for Wall<'w> {
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Option<Weight> { None }
	
	fn run(&mut self) -> ProcessingStatus {
		PARTICLE_NO_PROCESS
	}
}


#[derive(Debug)]
pub struct Dust<'w> {
	base: BaseParticle<'w>
}

impl<'w> Processable<'w> for Dust<'w> {
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Option<Weight> { Some(1201.0) } //kg/m³, a quartz sand
	
	fn run(&mut self) -> ProcessingStatus {
		//TODO: Replace this call to JS Math.random() with rand() seeded on some random data in our scratch.
		let drift_direction: i32 = (Math::random() * 3.0) as i32 - 1;
		//let mut rng = Rand::new(«seed here»);
		//rng.range(0,3);
		let next_loc1 = self.base.neighbour(drift_direction, -1);
		if let Some(next_loc2) = next_loc1 {
			let next_loc3 = hydrate_with_data(next_loc2);
			if let Some(weight) = next_loc3.weight() {
				if weight < self.weight().unwrap() && next_loc3.phase() != Phase::Solid {
					self.base.swap(next_loc3.base());
					return PARTICLE_DID_PROCESSING
				} else {
					return PARTICLE_IS_WAITING
				}
			} else {
				return PARTICLE_IS_WAITING
			}
		} else {
			return PARTICLE_PROCESSING_FAILED
		}
	}
}



#[enum_dispatch(Processable)]
pub enum Particle<'w> {
	Air(Air<'w>),
	Wall(Wall<'w>),
	Dust(Dust<'w>),
}



pub fn hydrate_with_data<'w>(base: BaseParticle<'w>) -> Particle<'w> {
	match base.type_id() {
		0 => Air { base }.into(),
		1 => Wall{ base }.into(),
		2 => Dust{ base }.into(),
		_ => panic!("Unknown particle ID {}.", base.type_id()),
	}
}
