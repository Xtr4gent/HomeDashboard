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

export function setClockForTests(clock: Clock | null): void {
  activeClock = clock ?? systemClock;
}
