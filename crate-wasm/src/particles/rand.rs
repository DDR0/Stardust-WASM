pub struct Rand {
	seed: u32,
}

impl Rand {
	pub fn new(seed: u32) -> Rand {
		Rand {
			seed: (seed + 1) % 2147483647
		}
	}
	fn next(&mut self) -> u32 { 
		self.seed = self.seed * 16807 % 2147483647;
		self.seed
	}
	pub fn float(&mut self) -> f64 { 
		(self.next() - 1) as f64 / 2147483646.0
	}
	pub fn range(&mut self, min: i32, max: i32) -> i32 { 
		((self.float() * (max-min) as f64) as i32 + min) as i32
	}
}