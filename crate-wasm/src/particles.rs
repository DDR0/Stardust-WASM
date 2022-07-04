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
	//scratch1: lower 32 bits used for random seed
	fn base(self) -> BaseParticle<'w> { self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Result<Weight, ()> { Ok(1201.0) } //kg/m³, a quartz sand
	
	fn run(&mut self) -> Result<(), ()> {
		// The following call to Math.random() here breaks wasm.init() in the parent worker JS.
		// (Math::random() * 3.0) as i32 - 1;
		
		let scratch1 = self.base.scratch1();
		let mut rng = Rand::new(scratch1 as u32);
		
		let mut initiative = self.base.initiative();
		let velocity_x = self.base.velocity_x();
		let velocity_y = self.base.velocity_y() + 1.; //gravity!
		
		if self.base.is_new_tick() {
			initiative += (velocity_x.abs().powf(2.) + velocity_y.abs().powf(2.)).sqrt()
		}
		
		if initiative < 1.0 {
			return Err(());
		}
		
		{
			let drift_direction: i32 = rng.range(0,3) - 1;
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
			
			if drift_direction != 0 {
				initiative -= 0.4142135623730951; //Apply an initiative penalty if we moved at an angle, because we moved more than one pixel then.
			}
			
			//Can't set here because we borrowed self.base for neighbour?
			//self.base.set_velocity_x(0.); //Just nullify velocity for now. (Approximates very high friction.)
			//self.base.set_velocity_y(0.);
			//self.base.swap(next_loc.base());
		}
		
		self.base.set_initiative(initiative);
		self.base.set_scratch1(scratch1 & 0x_FFFF_FFFF_0000_0000 | (scratch1 as u64));
		
		//console::log_1(&format!("dbg").into());
		
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