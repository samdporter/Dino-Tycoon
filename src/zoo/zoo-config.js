// Game-specific persisted identifiers and save schema. Load before shared/10-core.js.
window.Z = window.Z || {};
window.Z.GameConfig = {
  storage: { saveKey: 'wildacres.save.v1', settingsKey: 'wildacres.settings.v1', database: 'wildacres' },
  emptyFinance: function () {
    return { tickets: 0, food: 0, shops: 0, boats: 0, donations: 0, animals: 0, construction: 0, upkeep: 0, wages: 0, marketing: 0, other: 0 };
  },
  createState: function (n) {
    return {
      version: 1, gridN: n, mapSize: n === 40 ? 'small' : n === 72 ? 'large' : n === 88 ? 'huge' : 'medium',
      money: 25000, loan: 0, day: 1, time: 0.3, speed: 1, ticketPrice: 8,
      rating: 1, reputation: 50, marketing: { active: false, daysLeft: 0 }, open: true,
      elev: new Int8Array((n + 1) * (n + 1)), map: { id: 'meadow', name: 'Grassland Sanctuary', i0: 0, j0: 0, i1: n - 1, j1: n - 1 },
      terrain: new Uint8Array(n * n), path: new Uint8Array(n * n),
      fenceX: new Uint8Array(n * (n + 1)), fenceZ: new Uint8Array((n + 1) * n),
      tileObj: new Int32Array(n * n), tileEnc: new Int16Array(n * n), dirt: new Uint8Array(n * n),
      coasterRail: new Uint8Array(n * n), coasterElev: new Int8Array(n * n), coasterSpec: new Uint8Array(n * n),
      coaster: { trains: [], nextTrain: 1, stats: { riders: 0, income: 0, boardings: 0, breakdowns: 0, maxExcitement: 0 } },
      objects: [], enclosures: [], animals: [], guests: [], staff: [], finance: { today: window.Z.emptyFinance(), history: [] },
      goals: {}, stats: { guestsTotal: 0, babiesBorn: 0, escapes: 0, deaths: 0, births: 0, peakGuests: 0, donations: 0, injuries: 0, compensation: 0, ridesTaken: 0, arcadePlayed: 0 },
      unlocked: { star: 0 }, messages: [], nextId: 1, panic: 0, difficulty: 'normal',
      weather: { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' }, activeEvents: [], eventAt: 3, debtWarn: 0,
      boats: { vipT: 0, trips: 0, income: 0, vips: 0, vipIncome: 0 }
    };
  }
};
