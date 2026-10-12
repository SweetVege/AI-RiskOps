// Demo mode replaces sign-in with the simulated profile switcher and makes every API read-only.
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}
