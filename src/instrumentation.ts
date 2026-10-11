export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.ICEWALL_NO_SCHEDULER === "1") return;
  const { startScheduler } = await import("./server/scheduler");
  startScheduler();
}
