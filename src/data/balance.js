// Stage 1 tuning (GDD §20). All values are illustrative placeholders, not real-world figures.
// Verified by tests/sim.test.mjs: day max 35.0 kW, evening peak 47.8 kW, ~692 kWh/day.

export const BALANCE = {
  start: {
    credits: 5000,
    poles: 20,
    transformers: 3,
    cable: 500, // metres
    kits: 3,
    fuel: 100, // units
  },
  startClockMin: 17 * 60, // mission opens at 17:00, day 1 (dusk)
  ticksPerHour: 60, // 1 tick = 1 sim-minute
  realSecondsPerSimHour: 15, // at speed x1

  costs: {
    pole: 80, // installation credits per pole (plus 1 pole from stock)
    cablePerM: 1, // installation credits per metre (plus metres from stock)
    transformer: 600,
    drop: 15, // service drop to a building (no cable stock used)
    maintain: 150,
    repairLabour: 200,
    refundRate: 0.5,
    dailyOverhead: 40, // staff & admin, charged at midnight
  },

  procurement: {
    fuel: { qty: 50, cost: 250, leadH: 6 },
    poles: { qty: 5, cost: 400, leadH: 4 },
    cable: { qty: 100, cost: 150, leadH: 4 },
    transformer: { qty: 1, cost: 1500, leadH: 8 },
    kits: { qty: 1, cost: 300, leadH: 6 },
  },

  generator: {
    maxKW: 100,
    rampH: 0.25, // sim-hours from 0 to full availability
    kWhPerFuel: 20,
    kWhPerFuelWorn: 16, // efficiency when condition < 50%
    servicingCapKW: 50, // output cap while being serviced
    wearPerRunHour: 0.35, // condition % lost per running hour
  },

  network: {
    maxSpan: 40, // metres between supports
    dropReach: 22, // metres from an LV node to a building footprint
    mvRatingKW: 150,
    lvRatingKW: 50,
    lossPer100m: 0.02, // fraction × (load/rating) per 100 m (simplified)
    transformerLoss: 0.02, // fixed fraction of throughput (98% efficient)
  },

  transformer: {
    ratingKW: 40,
    warnPct: 85,
    tripPct: 100, // sustained above this → trip after tripDelayH
    instantTripPct: 130,
    tripDelayH: 1,
    resetCoolH: 0.5,
    wearBaseH: 0.15,
    wearLoadH: 0.5, // × (load/rating)^2 per hour
    ambientC: 35,
    tempPerLoad: 50, // °C rise at 100% load
  },

  crew: {
    speedMPerH: 300,
    repairH: 2,
    maintainH: 1,
  },

  tariff: 0.4, // credits per kWh, regulated (fixed in Stage 1)

  // Hourly demand multipliers on nominal kW (§20: 1 / 8 / 12 / 10 kW)
  profiles: {
    home: (h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 17 ? 0.5 : 0.3),
    school: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1),
    market: (h) => (h >= 9 && h <= 19 ? 1.0 : 0.1),
    clinic: () => 1.0,
  },

  fault: {
    earliestDay: 2,
    warnHour: 18, // overheating warning
    minPowered: 8,
    warnLeadH: 1,
  },

  fail: {
    fuelGraceH: 3,
    clinicOutageH: 6,
    bankruptGraceH: 2,
    deadlineDay: 5, // ends 23:59 on this day
  },

  victory: {
    stableHours: 24,
  },
};

export const CUSTOMER_TYPES = {
  home: { label: 'Home', nominal: 1, priority: 1, critical: false },
  school: { label: 'School', nominal: 8, priority: 2, critical: false },
  market: { label: 'Market', nominal: 10, priority: 1, critical: false },
  clinic: { label: 'Clinic', nominal: 12, priority: 3, critical: true },
};
