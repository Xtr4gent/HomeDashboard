export type Clock = {
  now(): Date;
};

const systemClock: Clock = {
  now() {
    return new Date();
  },
};

let activeClock: Clock = systemClock;

export function getClock(): Clock {
  return activeClock;
}

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Clock overrides are test-only and unavailable outside NODE_ENV=test.");
  }
}

export function setClockForTests(clock: Clock | null): void {
  assertTestEnvironment();
  activeClock = clock ?? systemClock;
}

export function resetClockForTests(): void {
  setClockForTests(null);
}
