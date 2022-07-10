mod rand;
pub mod particle_data;

use web_sys::console;
//use js_sys::Math; //Danger; breaks webpack module loading.
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


fn resetCommon(bp: &mut BaseParticle) {
	bp.set_initiative(0.0);
	bp.set_velocity_x(0.0);
	bp.set_velocity_y(0.0);
	bp.set_subpixel_position_x(0.0);
	bp.set_subpixel_position_y(0.0);
	bp.set_mass(0.0);
	bp.set_temperature(0.0);
}


#[enum_dispatch]
pub trait Processable {
	fn base(&mut self) -> &mut BaseParticle;
	
	fn phase(&self) -> Phase;
	fn weight(&self) -> Result<Weight, ()>; //No weight, object is unmovable.
	
	fn reset(&mut self);
	
	fn run(&mut self) -> Result<(), ()>;
}



#[derive(Debug)]
pub struct Air {
	base: BaseParticle
}

impl Processable for Air {
	fn base(&mut self) -> &mut BaseParticle { &mut self.base }
	
	fn phase(&self) -> Phase { Phase::Gas }
	fn weight(&self) -> Result<Weight, ()> { Ok(1.185) } //kg/m³ at sea level - steel is 7900.0
	
	fn reset(&mut self) {
		resetCommon(&mut self.base);
		self.base.set_rgba(0x0000FF44);
	}
	
	fn run(&mut self) -> Result<(), ()> {
		Err(())
	}
}


#[derive(Debug)]
pub struct Wall {
	base: BaseParticle
}

impl Processable for Wall {
	fn base(&mut self) -> &mut BaseParticle { &mut self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Result<Weight, ()> { Err(()) }
	
	fn reset(&mut self) {
		resetCommon(&mut self.base);
		self.base.set_rgba(0xAC844AFF);
	}
	
	fn run(&mut self) -> Result<(), ()> {
		Err(())
	}
}


#[derive(Debug)]
pub struct Dust {
	base: BaseParticle
}

impl Processable for Dust {
	//scratch1: lower 32 bits used for random seed
	fn base(&mut self) -> &mut BaseParticle { &mut self.base }
	
	fn phase(&self) -> Phase { Phase::Solid }
	fn weight(&self) -> Result<Weight, ()> { Ok(1201.0) } //kg/m³, a quartz sand
	
	
	
	fn reset(&mut self) {
		resetCommon(&mut self.base);
		self.base.set_rgba(0xAC844AFF);
		self.base.set_scratch1(self.base.get_random_seed() as u64);
	}
	
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
			return Err(()); //Not enough juice to go anywhere.
		}
		
		let drift_direction: i32 = rng.range(0,3) - 1;
		let base_part = self.base.neighbour(drift_direction, -1);
		let mut next_loc = hydrate_with_data(base_part?);
		
		//If landing on a solid thing, or on a liquid that we would float in, do nothing.
		if next_loc.phase() == Phase::Solid || next_loc.weight()? >= self.weight()? { //iron, a solid, floats on mercury, a liquid
			return Err(());
		}
		
		//Whatever we are moving through, apply a speed penalty for the density of the substance.
		//TODO: Make this use initiative vs a stochastic process.
		if next_loc.weight()? / self.weight()? < rng.float() {
			return Err(());
		}
		
		if drift_direction != 0 {
			initiative -= 0.4142135623730951; //Apply an initiative penalty if we moved at a 45° angle, because we moved more than one pixel then.
		}
		
		//Can't set here because we borrowed self.base for neighbour?
		self.base.set_velocity_x(0.); //Just nullify velocity for now. (Approximates very high friction.)
		self.base.set_velocity_y(0.);
		
		self.base.set_initiative(initiative);
		self.base.set_scratch1(scratch1 & 0xFFFF_FFFF_0000_0000 | (scratch1 as u64));
		
		self.base.swap(next_loc.base());
		//console::log_1(&format!("dbg").into());
		
		Ok(())
	}
}



#[enum_dispatch(Processable)]
pub enum Particle {
	Air(Air),
	Wall(Wall),
	Dust(Dust),
}



pub fn hydrate_with_data(base: BaseParticle) -> Particle {
	match base.type_id() {
		0 => Air { base }.into(),
		1 => Wall{ base }.into(),
		2 => Dust{ base }.into(),
		_ => panic!("Unknown particle ID {}.", base.type_id()),
	}
}

pub fn reset_to_type(mut base: BaseParticle, new_type: u8) -> Particle {
	console::log_1(&format!("resetting particle to {}.", new_type).into());
	base.set_type_id(new_type);
	let mut p = hydrate_with_data(base);
	p.reset();
	p
}