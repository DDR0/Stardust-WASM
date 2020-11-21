import("../../crate-wasm/pkg").then(wasm => {
  wasm.init();
  self.addEventListener("message", ev => {
    const name = ev.data;
    if (!name) {
      self.postMessage({ allGood: false, error: ev.data + " is not a number!" });
      return;
    }
    try {
      const hello = wasm.hello(name);
      self.postMessage({ allGood: true, hello });
    } catch (err) {
      self.postMessage({ allGood: false, error: err.message });
    }
  });
});
