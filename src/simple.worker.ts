// src/simple.worker.ts
self.onmessage = (e) => {
  console.log("Worker received:", e.data);
  self.postMessage("hello from simple worker");
};
