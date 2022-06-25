mod rand;
pub mod particle_data;

use web_sys::console;
use js_sys::Math;
use enum_dispatch::enum_dispatch;

use rand::Rand;
use particle_data::{ParticleData, BaseParticle};

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
	fn weight(&self) -> Result<Weight, ()>; //No weight, object is unmovable.
	
	fn run(&mut self) -> Result<(), ()>;
}



#[derive(Debug)]
pub struct Air<'w> {
	base: BaseParticle<'w>
}

impl<'w> Processable<'w> for Air<'w> {
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Gas }
	fn weight(&self) -> Result<Weight, ()> { Ok(1.185) } //kg/m³ at sea level - steel is 7900.0
	
	fn run(&mut self) -> Result<(), ()> {
		Err(())
	}
}


#[derive(Debug)]
pub struct Wall<'w> {
	base: BaseParticle<'w>
}

impl<'w> Processable<'w> for Wall<'w> {
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Result<Weight, ()> { Err(()) }
	
	fn run(&mut self) -> Result<(), ()> {
		Err(())
	}
}


#[derive(Debug)]
pub struct Dust<'w> {
	base: BaseParticle<'w>
}

impl<'w> Processable<'w> for Dust<'w> {
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Result<Weight, ()> { Ok(1201.0) } //kg/m³, a quartz sand
	
	fn run(&mut self) -> Result<(), ()> {
		//TODO: Replace this call to JS Math.random() with rand() seeded on some random data in our scratch.
		let drift_direction: i32 = (Math::random() * 3.0) as i32 - 1;
		//let mut rng = Rand::new(«seed here»);
		//rng.range(0,3);
		
		let next_loc = hydrate_with_data(self.base.neighbour(drift_direction, -1)?);
		if next_loc.weight()? > self.weight()? || next_loc.phase() == Phase::Solid {
			return Err(())
		}
		
		self.base.swap(next_loc.base());
		Ok(())
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