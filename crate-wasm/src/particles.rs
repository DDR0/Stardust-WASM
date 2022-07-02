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
		// The following call to Math.random() here breaks wasm.init() in the parent worker JS.
		// (Math::random() * 3.0) as i32 - 1;
		
		let mut rng = Rand::new(self.base.scratch1() as u32);
		let drift_direction: i32 = rng.range(0,3) - 1;
		// 
		let next_loc = hydrate_with_data(self.base.neighbour(drift_direction, -1)?);
		
		//If landing on a solid thing, or on a liquid that we would float in, do nothing.
		if next_loc.phase() == Phase::Solid || next_loc.weight()? >= self.weight()? { //iron, a solid, floats on mercury, a liquid
			return Err(())
		}
		
		//Whatever we are moving through, apply a speed penalty for the density of the substance.
		//TODO: Make this use initiative vs a stochastic process.
		if next_loc.weight()? / self.weight()? < rng.float() {
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