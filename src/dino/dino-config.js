// Game-specific persisted identifiers and save schema. Load before shared/10-core.js.
window.Z = window.Z || {};
window.Z.GameConfig = {
  storage: { saveKey: 'amberacres.save.v2', settingsKey: 'amberacres.settings.v1', database: 'amberacres' },
  emptyFinance: function () {
    return { tickets: 0, food: 0, shops: 0, donations: 0, animals: 0, construction: 0, upkeep: 0, wages: 0, marketing: 0, research: 0, interest: 0, other: 0 };
  },
  createState: function (n) {
    return {
      version: 2, gridN: n, mapSize: n === 40 ? 'small' : n === 72 ? 'large' : n === 88 ? 'huge' : 'medium',
      money: 30000, loan: 0, loans: [], day: 1, time: 0.3, speed: 1, ticketPrice: 8,
      rating: 1, reputation: 50, marketing: { active: false, daysLeft: 0 }, open: true,
      elev: new Int8Array((n + 1) * (n + 1)), map: { id: 'fern_meadow', i0: 0, j0: 0, i1: n - 1, j1: n - 1 },
      terrain: new Uint8Array(n * n), path: new Uint8Array(n * n),
      fenceX: new Uint8Array(n * (n + 1)), fenceZ: new Uint8Array((n + 1) * n),
      tileObj: new Int32Array(n * n), tileEnc: new Int16Array(n * n), dirt: new Uint8Array(n * n), ditch: new Uint8Array(n * n), moatTip: 0,
      rail: new Uint8Array(n * n), mono: { trains: [], nextTrain: 1, stats: { riders: 0, income: 0, boardings: 0, viewSec: 0, breakdowns: 0, lightning: 0, danger: 0 }, powered: true },
      coasterRail: new Uint8Array(n * n), coasterElev: new Int8Array(n * n), coasterSpec: new Uint8Array(n * n),
      coaster: { trains: [], nextTrain: 1, stats: { riders: 0, income: 0, boardings: 0, breakdowns: 0, maxExcitement: 0 } },
      safari: { routes: [], veh: [], nextRoute: 1, nextVeh: 1, zones: {}, away: [], lockdown: 0, cleanDays: 0, stats: { riders: 0, income: 0, sea: 0, air: 0, wildSeen: 0, wildIn: 0, kills: 0, seenKills: 0, injuries: 0, stranded: 0, nudges: 0, mainland: 0, returned: 0, lost: 0, close: 0, fed: 0, prot: {} } },
      objects: [], enclosures: [], animals: [], guests: [], staff: [], finance: { today: window.Z.emptyFinance(), history: [] },
      goals: {}, stats: { guestsTotal: 0, babiesBorn: 0, escapes: 0, deaths: 0, births: 0, peakGuests: 0, donations: 0, injuries: 0, compensation: 0, predations: 0, fundingTotal: 0, ridesTaken: 0, arcadePlayed: 0 },
      unlocked: { star: 0 }, messages: [], nextId: 1, research: null, panic: 0,
      difficulty: 'normal', weather: { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' }, activeEvents: [], eventAt: -1, debtWarn: 0
    };
  }
};
