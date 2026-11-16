// ===== 00-data.js =====
var window = typeof window!=='undefined' ? window : globalThis;
window.Z = window.Z || {};
window.Z.DATA = {
  terrain: [
    { id: "grass", name: "Grass", colour: "#6fae4a", cost: 5 },
    { id: "savannah", name: "Savannah", colour: "#c9a85a", cost: 8 },
    { id: "dirt", name: "Dirt", colour: "#8b6a45", cost: 4 },
    { id: "sand", name: "Sand", colour: "#e6d19a", cost: 12 },
    { id: "snow", name: "Snow", colour: "#f2f6fa", cost: 15 },
    { id: "rainforest", name: "Rainforest floor", colour: "#2f7a3e", cost: 18 },
    { id: "forest", name: "Woodland", colour: "#3e6b35", cost: 15 },
    { id: "rock", name: "Rock", colour: "#8a8580", cost: 20 },
    { id: "water", name: "Water", colour: "#3a86b8", cost: 30 }
  ],

  fences: [
    { id: "low_wood", name: "Low wooden fence", cost: 15, strength: 1, height: 0.9, seeThrough: true, style: "wood" },
    { id: "post_rail", name: "Post and rail", cost: 25, strength: 1, height: 1.2, seeThrough: true, style: "rail" },
    { id: "hedge", name: "Hedge", cost: 30, strength: 1, height: 1.8, seeThrough: false, style: "hedge" },
    { id: "chainlink", name: "Chain-link fence", cost: 45, strength: 3, height: 2.0, seeThrough: true, style: "chain" },
    { id: "glass", name: "Glass panel", cost: 75, strength: 3, height: 2.2, seeThrough: true, style: "glass" },
    { id: "reinforced", name: "Reinforced mesh", cost: 100, strength: 5, height: 2.5, seeThrough: true, style: "chain" },
    { id: "concrete", name: "Concrete wall", cost: 120, strength: 5, height: 3.0, seeThrough: false, style: "concrete" }
  ],

  paths: [
    { id: "dirt_path", name: "Dirt path", cost: 5, colour: "#9c7a52", speed: 1.0 },
    { id: "paved", name: "Paved path", cost: 15, colour: "#c9c5be", speed: 1.2 },
    { id: "cobble", name: "Cobbled path", cost: 25, colour: "#8d8780", speed: 1.1 }
  ],

  animals: [
    {
      id: "meerkat", name: "Meerkat", emoji: "🐾", biome: "sand",
      terrainPrefs: { sand: 0.5, savannah: 0.3, dirt: 0.2 },
      cost: 400, "upkeep/day": 10, appeal: 40, space: 1, social: [5, 20], diet: "insectivore",
      foliage: ["tall_grass", "rock_pile", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 1, speed: 0.8, size: 0.2,
      lifespan: 720, breedChance: 0.3, star: 0, danger: 0,
      fact: "Meerkats live in family groups called mobs, and one member keeps watch while the others forage."
    },
    {
      id: "flamingo", name: "Flamingo", emoji: "🦩", biome: "water",
      terrainPrefs: { water: 0.5, sand: 0.3, dirt: 0.2 },
      cost: 1200, "upkeep/day": 30, appeal: 45, space: 2, social: [6, 30], diet: "omnivore",
      foliage: ["rock_pile", "tall_grass"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 0.7, size: 0.7,
      lifespan: 1800, breedChance: 0.15, star: 0, danger: 0,
      fact: "Flamingos get their pink colour from carotenoids in the algae and shrimp they eat."
    },
    {
      id: "zebra", name: "Zebra", emoji: "🦓", biome: "savannah",
      terrainPrefs: { savannah: 0.7, grass: 0.2, dirt: 0.1 },
      cost: 1400, "upkeep/day": 35, appeal: 30, space: 4, social: [3, 12], diet: "herbivore",
      foliage: ["acacia", "tall_grass", "bush"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 3, speed: 1.4, size: 1.3,
      lifespan: 1500, breedChance: 0.12, star: 0, danger: 1,
      fact: "Every zebra has a unique stripe pattern, and the stripes may help deter biting flies."
    },
    {
      id: "giraffe", name: "Giraffe", emoji: "🦒", biome: "savannah",
      terrainPrefs: { savannah: 0.6, grass: 0.2, dirt: 0.2 },
      cost: 3000, "upkeep/day": 75, appeal: 42, space: 6, social: [2, 6], diet: "herbivore",
      foliage: ["acacia", "baobab", "tall_grass"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 3, speed: 1.2, size: 2.5,
      lifespan: 1500, breedChance: 0.08, star: 1, danger: 0,
      fact: "A giraffe's neck can be around two metres long, yet it has only seven neck vertebrae, as most mammals do."
    },
    {
      id: "lion", name: "Lion", emoji: "🦁", biome: "savannah",
      terrainPrefs: { savannah: 0.6, rock: 0.2, dirt: 0.2 },
      cost: 5000, "upkeep/day": 125, appeal: 50, space: 6, social: [3, 8], diet: "carnivore",
      foliage: ["acacia", "boulder", "tall_grass"],
      needsWater: true, needsShelter: true, needsRocks: true, minFence: 4, speed: 1.4, size: 1.1,
      lifespan: 900, breedChance: 0.1, star: 2, danger: 3,
      fact: "Lions are the only cats that live in groups, known as prides."
    },
    {
      id: "elephant", name: "Elephant", emoji: "🐘", biome: "savannah",
      terrainPrefs: { savannah: 0.5, dirt: 0.2, water: 0.2, forest: 0.1 },
      cost: 12000, "upkeep/day": 300, appeal: 58, space: 12, social: [3, 10], diet: "herbivore",
      foliage: ["baobab", "acacia", "palm", "tall_grass"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.2, size: 3.2,
      lifespan: 3600, breedChance: 0.04, star: 4, danger: 3,
      fact: "An elephant's trunk contains around 40,000 separate muscles."
    },
    {
      id: "rhino", name: "Rhinoceros", emoji: "🦏", biome: "savannah",
      terrainPrefs: { savannah: 0.5, grass: 0.3, water: 0.1, dirt: 0.1 },
      cost: 4800, "upkeep/day": 120, appeal: 35, space: 10, social: [1, 2], diet: "herbivore",
      foliage: ["acacia", "tall_grass", "bush", "boulder"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.1, size: 1.8,
      lifespan: 2400, breedChance: 0.03, star: 2, danger: 2,
      fact: "Rhinos have poor eyesight but a very good sense of smell."
    },
    {
      id: "hippo", name: "Hippopotamus", emoji: "🦛", biome: "water",
      terrainPrefs: { water: 0.5, savannah: 0.3, dirt: 0.2 },
      cost: 3500, "upkeep/day": 90, appeal: 30, space: 6, social: [2, 4], diet: "herbivore",
      foliage: ["tall_grass", "palm"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 3, speed: 0.9, size: 1.5,
      lifespan: 2400, breedChance: 0.04, star: 1, danger: 2,
      fact: "Hippos cannot swim, so they stay in the water by walking along the river bottom."
    },
    {
      id: "tiger", name: "Tiger", emoji: "🐯", biome: "forest",
      terrainPrefs: { forest: 0.5, rainforest: 0.3, water: 0.1, rock: 0.1 },
      cost: 9500, "upkeep/day": 240, appeal: 55, space: 8, social: [1, 1], diet: "carnivore",
      foliage: ["jungle_tree", "fern", "bush", "boulder"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.5, size: 1.0,
      lifespan: 960, breedChance: 0.06, star: 4, danger: 3,
      fact: "Each tiger's stripe pattern is unique, and their skin is striped too."
    },
    {
      id: "panda", name: "Giant panda", emoji: "🐼", biome: "forest",
      terrainPrefs: { forest: 0.6, rainforest: 0.2, rock: 0.2 },
      cost: 11000, "upkeep/day": 275, appeal: 60, space: 5, social: [1, 2], diet: "herbivore",
      foliage: ["bamboo", "fern"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 0.7, size: 0.7,
      lifespan: 1200, breedChance: 0.03, star: 4, danger: 1,
      fact: "Giant pandas can spend 10 to 16 hours a day eating bamboo."
    },
    {
      id: "gorilla", name: "Gorilla", emoji: "🦍", biome: "rainforest",
      terrainPrefs: { rainforest: 0.7, forest: 0.2, dirt: 0.1 },
      cost: 8000, "upkeep/day": 200, appeal: 52, space: 6, social: [2, 6], diet: "herbivore",
      foliage: ["jungle_tree", "fern", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.0, size: 0.9,
      lifespan: 2100, breedChance: 0.03, star: 3, danger: 2,
      fact: "Gorillas share roughly 98 per cent of their DNA with humans."
    },
    {
      id: "red_panda", name: "Red panda", emoji: "🦊", biome: "forest",
      terrainPrefs: { forest: 0.6, rainforest: 0.3, rock: 0.1 },
      cost: 1400, "upkeep/day": 35, appeal: 45, space: 3, social: [1, 2], diet: "herbivore",
      foliage: ["bamboo", "pine", "fern"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 1, speed: 0.8, size: 0.3,
      lifespan: 720, breedChance: 0.08, star: 0, danger: 0,
      fact: "Red pandas have a false thumb, an extended wrist bone that helps them grip bamboo."
    },
    {
      id: "wolf", name: "Grey wolf", emoji: "🐺", biome: "forest",
      terrainPrefs: { forest: 0.5, grass: 0.3, rock: 0.2 },
      cost: 2200, "upkeep/day": 55, appeal: 28, space: 6, social: [4, 8], diet: "carnivore",
      foliage: ["pine", "oak", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.5, size: 0.8,
      lifespan: 780, breedChance: 0.1, star: 1, danger: 2,
      fact: "Wolves howl to keep in touch with their pack across long distances."
    },
    {
      id: "brown_bear", name: "Brown bear", emoji: "🐻", biome: "forest",
      terrainPrefs: { forest: 0.5, rock: 0.2, grass: 0.2, water: 0.1 },
      cost: 4400, "upkeep/day": 110, appeal: 38, space: 8, social: [1, 2], diet: "omnivore",
      foliage: ["pine", "fern", "bush"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.2, size: 1.2,
      lifespan: 1500, breedChance: 0.06, star: 2, danger: 3,
      fact: "Brown bears can reach around 56 km/h (35 mph) over short distances."
    },
    {
      id: "polar_bear", name: "Polar bear", emoji: "🐻‍❄️", biome: "snow",
      terrainPrefs: { snow: 0.6, water: 0.3, rock: 0.1 },
      cost: 6500, "upkeep/day": 170, appeal: 50, space: 8, social: [1, 1], diet: "carnivore",
      foliage: ["ice_floe", "boulder"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 1.3, size: 1.4,
      lifespan: 1500, breedChance: 0.05, star: 3, danger: 3,
      fact: "Polar bears have black skin beneath their white-looking fur, which helps them absorb heat."
    },
    {
      id: "penguin", name: "Penguin", emoji: "🐧", biome: "water",
      terrainPrefs: { water: 0.5, rock: 0.3, snow: 0.2 },
      cost: 2500, "upkeep/day": 65, appeal: 40, space: 2, social: [4, 20], diet: "piscivore",
      foliage: ["ice_floe", "rock_pile"],
      needsWater: true, needsShelter: false, needsRocks: true, minFence: 1, speed: 0.8, size: 0.6,
      lifespan: 1200, breedChance: 0.15, star: 1, danger: 0,
      fact: "Penguins cannot fly, but they are excellent swimmers and can dive to great depths."
    },
    {
      id: "camel", name: "Camel", emoji: "🐪", biome: "sand",
      terrainPrefs: { sand: 0.7, savannah: 0.2, rock: 0.1 },
      cost: 1400, "upkeep/day": 35, appeal: 20, space: 4, social: [2, 8], diet: "herbivore",
      foliage: ["cactus", "bush", "palm"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 2, speed: 1.1, size: 2.0,
      lifespan: 2400, breedChance: 0.05, star: 0, danger: 1,
      fact: "Camels store fat in their humps, not water."
    },
    {
      id: "ostrich", name: "Ostrich", emoji: "🐦", biome: "savannah",
      terrainPrefs: { savannah: 0.6, sand: 0.3, dirt: 0.1 },
      cost: 1000, "upkeep/day": 25, appeal: 18, space: 4, social: [2, 6], diet: "omnivore",
      foliage: ["acacia", "bush", "tall_grass"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 2, speed: 1.4, size: 1.2,
      lifespan: 2400, breedChance: 0.1, star: 0, danger: 1,
      fact: "An ostrich's eyes are the largest of any land animal."
    },
    {
      id: "kangaroo", name: "Red kangaroo", emoji: "🦘", biome: "grass",
      terrainPrefs: { grass: 0.5, savannah: 0.3, forest: 0.2 },
      cost: 1300, "upkeep/day": 33, appeal: 25, space: 4, social: [2, 8], diet: "herbivore",
      foliage: ["tall_grass", "oak", "bush"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 3, speed: 1.2, size: 1.2,
      lifespan: 1200, breedChance: 0.1, star: 0, danger: 1,
      fact: "Female kangaroos can pause a pregnancy, a process called embryonic diapause."
    },
    {
      id: "crocodile", name: "Nile crocodile", emoji: "🐊", biome: "water",
      terrainPrefs: { water: 0.5, dirt: 0.2, rainforest: 0.2, sand: 0.1 },
      cost: 4800, "upkeep/day": 120, appeal: 30, space: 4, social: [1, 4], diet: "carnivore",
      foliage: ["palm", "fern", "rock_pile", "bush"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 0.5, size: 0.5,
      lifespan: 2700, breedChance: 0.06, star: 2, danger: 3,
      fact: "Crocodiles cannot stick out their tongues, because the tongue is attached to the floor of the mouth."
    }
  ],

  scenery: [
    { id: "oak", name: "Oak tree", emoji: "🌳", cost: 120, kind: "tree", biome: "forest", aesthetic: 3, inEnclosure: true },
    { id: "pine", name: "Pine tree", emoji: "🌲", cost: 130, kind: "tree", biome: "forest", aesthetic: 3, inEnclosure: true },
    { id: "acacia", name: "Acacia tree", emoji: "🌳", cost: 120, kind: "tree", biome: "savannah", aesthetic: 3, inEnclosure: true },
    { id: "palm", name: "Palm tree", emoji: "🌴", cost: 140, kind: "tree", biome: "sand", aesthetic: 3, inEnclosure: true },
    { id: "bamboo", name: "Bamboo grove", emoji: "🎍", cost: 90, kind: "tree", biome: "forest", aesthetic: 3, inEnclosure: true },
    { id: "baobab", name: "Baobab tree", emoji: "🌳", cost: 350, kind: "tree", biome: "savannah", aesthetic: 4, inEnclosure: true },
    { id: "cactus", name: "Cactus", emoji: "🌵", cost: 60, kind: "bush", biome: "sand", aesthetic: 2, inEnclosure: true },
    { id: "snow_pine", name: "Snow pine", emoji: "🌲", cost: 130, kind: "tree", biome: "snow", aesthetic: 3, inEnclosure: true },
    { id: "jungle_tree", name: "Jungle tree", emoji: "🌴", cost: 220, kind: "tree", biome: "rainforest", aesthetic: 4, inEnclosure: true },
    { id: "bush", name: "Shrub", emoji: "🌿", cost: 25, kind: "bush", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "fern", name: "Fern", emoji: "🌿", cost: 20, kind: "bush", biome: "rainforest", aesthetic: 2, inEnclosure: true },
    { id: "tall_grass", name: "Tall grass", emoji: "🌾", cost: 10, kind: "bush", biome: "any", aesthetic: 1, inEnclosure: true },
    { id: "boulder", name: "Boulder", emoji: "🪨", cost: 80, kind: "rock", biome: "rock", aesthetic: 2, inEnclosure: true },
    { id: "rock_pile", name: "Rock pile", emoji: "🪨", cost: 50, kind: "rock", biome: "rock", aesthetic: 2, inEnclosure: true },
    { id: "ice_floe", name: "Ice floe", emoji: "🧊", cost: 90, kind: "rock", biome: "snow", aesthetic: 2, inEnclosure: true },
    { id: "log", name: "Fallen log", emoji: "🪵", cost: 40, kind: "deco", biome: "forest", aesthetic: 2, inEnclosure: true },
    { id: "cave_shelter", name: "Cave shelter", emoji: "🕳️", cost: 400, kind: "shelter", biome: "rock", aesthetic: 3, inEnclosure: true },
    { id: "wooden_shelter", name: "Wooden shelter", emoji: "🛖", cost: 250, kind: "shelter", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "heat_rock", name: "Heat rock", emoji: "☀️", cost: 180, kind: "rock", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "climbing_frame", name: "Climbing frame", emoji: "🪜", cost: 350, kind: "toy", biome: "any", aesthetic: 3, inEnclosure: true },
    { id: "tyre_swing", name: "Tyre swing", emoji: "🛞", cost: 120, kind: "toy", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "ball", name: "Ball", emoji: "⚽", cost: 30, kind: "toy", biome: "any", aesthetic: 1, inEnclosure: true },
    { id: "bench", name: "Bench", emoji: "🪑", cost: 150, kind: "deco", biome: "any", aesthetic: 2, inEnclosure: false },
    { id: "lamp", name: "Lamp post", emoji: "💡", cost: 90, kind: "deco", biome: "any", aesthetic: 2, inEnclosure: false },
    { id: "flower_bed", name: "Flower bed", emoji: "🌷", cost: 60, kind: "deco", biome: "grass", aesthetic: 3, inEnclosure: false },
    { id: "fountain", name: "Fountain", emoji: "⛲", cost: 800, kind: "deco", biome: "any", aesthetic: 5, inEnclosure: false },
    { id: "bin", name: "Litter bin", emoji: "🗑️", cost: 40, kind: "deco", biome: "any", aesthetic: 0, inEnclosure: false },
    { id: "statue", name: "Statue", emoji: "🗿", cost: 500, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false },
    { id: "picnic_table", name: "Picnic table", emoji: "🧺", cost: 110, kind: "deco", biome: "grass", aesthetic: 2, inEnclosure: false },
    { id: "sign", name: "Information sign", emoji: "🪧", cost: 45, kind: "deco", biome: "any", aesthetic: 1, inEnclosure: false }
  ],

  buildings: [
    { id: "burger_stand", name: "Burger stand", emoji: "🍔", cost: 1200, upkeep: 20, type: "food", price: 6, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.5 }, star: 0 },
    { id: "pizza_hut", name: "Pizza kiosk", emoji: "🍕", cost: 1800, upkeep: 30, type: "food", price: 8, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.6 }, star: 0 },
    { id: "ice_cream", name: "Ice cream kiosk", emoji: "🍦", cost: 600, upkeep: 12, type: "food", price: 4, capacity: 3, w: 1, h: 1, satisfies: { hunger: 0.2, fun: 0.1 }, star: 0 },
    { id: "drinks_stall", name: "Drinks stall", emoji: "🥤", cost: 500, upkeep: 8, type: "drink", price: 3, capacity: 4, w: 1, h: 1, satisfies: { thirst: 0.6 }, star: 0 },
    { id: "coffee_cart", name: "Coffee cart", emoji: "☕", cost: 700, upkeep: 10, type: "drink", price: 4, capacity: 3, w: 1, h: 1, satisfies: { thirst: 0.4, energy: 0.3 }, star: 0 },
    { id: "toilets", name: "Toilets", emoji: "🚻", cost: 400, upkeep: 6, type: "toilet", price: 0, capacity: 6, w: 1, h: 1, satisfies: { bladder: 1 }, star: 0 },
    { id: "gift_shop", name: "Gift shop", emoji: "🎁", cost: 1500, upkeep: 20, type: "shop", price: 12, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.2 }, star: 1 },
    { id: "balloon_stand", name: "Balloon stand", emoji: "🎈", cost: 350, upkeep: 5, type: "shop", price: 5, capacity: 2, w: 1, h: 1, satisfies: { fun: 0.2 }, star: 0 },
    { id: "carousel", name: "Carousel", emoji: "🎠", cost: 5000, upkeep: 70, type: "ride", price: 6, capacity: 12, w: 2, h: 2, satisfies: { fun: 0.8 }, star: 2 },
    { id: "info_kiosk", name: "Info kiosk", emoji: "ℹ️", cost: 300, upkeep: 4, type: "info", price: 0, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.05 }, star: 0 },
    { id: "restaurant", name: "Restaurant", emoji: "🍽️", cost: 8000, upkeep: 120, type: "food", price: 14, capacity: 30, w: 2, h: 2, satisfies: { hunger: 1, thirst: 0.3, energy: 0.3 }, star: 3 },
    { id: "keeper_hut", name: "Keeper hut", emoji: "🛖", cost: 800, upkeep: 8, type: "staff", price: 0, capacity: 4, w: 1, h: 1, satisfies: {}, star: 0 },
    { id: "vet_clinic", name: "Vet clinic", emoji: "🏥", cost: 3500, upkeep: 50, type: "staff", price: 0, capacity: 4, w: 2, h: 2, satisfies: {}, star: 1 },
    { id: "education_centre", name: "Education centre", emoji: "🎓", cost: 5000, upkeep: 60, type: "info", price: 3, capacity: 40, w: 2, h: 2, satisfies: { fun: 0.5 }, star: 2 }
  ],

  staff: [
    { id: "keeper", name: "Keeper", emoji: "🧑‍🌾", "wage/day": 60, hireCost: 150, effect: "Feeds animals and cleans their enclosures" },
    { id: "vet", name: "Vet", emoji: "🩺", "wage/day": 120, hireCost: 800, effect: "Treats sick animals" },
    { id: "cleaner", name: "Cleaner", emoji: "🧹", "wage/day": 50, hireCost: 100, effect: "Sweeps paths and empties bins" },
    { id: "guide", name: "Guide", emoji: "🧭", "wage/day": 55, hireCost: 150, effect: "Boosts guest happiness" },
    { id: "security", name: "Security guard", emoji: "🛡️", "wage/day": 70, hireCost: 200, effect: "Recaptures escaped animals" }
  ],

  goals: [
    { id: "guests_100", text: "Welcome 100 guests", type: "guests", target: 100, reward: 600 },
    { id: "animals_5", text: "Have 5 animals in your zoo", type: "animals", target: 5, reward: 800 },
    { id: "rating_2", text: "Reach a 2-star zoo rating", type: "rating", target: 2, reward: 1000 },
    { id: "money_30000", text: "Have £30,000 in the bank", type: "money", target: 30000, reward: 1000 },
    { id: "species_3", text: "Keep 3 different species", type: "species", target: 3, reward: 1200 },
    { id: "babies_1", text: "Celebrate your first baby animal", type: "babies", target: 1, reward: 1000 },
    { id: "happiness_70", text: "Get average guest happiness to 70%", type: "happiness", target: 70, reward: 1500 },
    { id: "guests_1000", text: "Welcome 1,000 guests", type: "guests", target: 1000, reward: 2500 },
    { id: "rating_4", text: "Reach a 4-star zoo rating", type: "rating", target: 4, reward: 6000 },
    { id: "money_100000", text: "Have £100,000 in the bank", type: "money", target: 100000, reward: 8000 }
  ],

  guestNames: [
    "Amelia Clarke", "Oliver Bennett", "Priya Patel", "Jack Morrison", "Chloe Hughes",
    "Harry Wilson", "Sophie Turner", "George Hall", "Aisha Khan", "Thomas Reid",
    "Grace Evans", "Ethan Brooks", "Isla Campbell", "Mohammed Ali", "Lily Foster",
    "Alfie Shaw", "Ruby Price", "Samuel Grant", "Ella Walsh", "Daniel Hart",
    "Freya Lawson", "Joshua Burns", "Maya Singh", "Lewis Doyle", "Hannah Cole",
    "Callum Ross", "Zara Ahmed", "Ryan Murphy", "Eva Stone", "Owen Parry",
    "Chiara Rossi", "Nathan Moss", "Olivia Hayes", "Jamal Thompson", "Ruth Adeyemi",
    "Connor Fletcher", "Megan Rhodes", "Adam Booth", "Leah Mitchell", "Kieran Doherty",
    "Fatima Yusuf", "Ben Cartwright", "Emily Harper", "Dylan Webb", "Nadia Petrov",
    "Rhys Griffiths", "Holly Dixon", "Liam Farrow", "Imogen Pryce", "Victor Osei",
    "Beth Lambert", "Arjun Mehta", "Susan Oakley", "Malcolm Dunn", "Tara Whitfield",
    "Eli Anand", "Wendy Croft", "Gareth Lloyd", "Sunita Rao", "Stanley Pike"
  ],

  animalNames: [
    "Bramble", "Clover", "Pippin", "Nutmeg", "Biscuit", "Marmalade", "Sable", "Juniper", "Hazel", "Maple",
    "Moss", "Thistle", "Ginger", "Pepper", "Ziggy", "Olive", "Rosie", "Milo", "Bella", "Hugo",
    "Ollie", "Winnie", "Ada", "Basil", "Cinnamon", "Dusty", "Ember", "Frankie", "Gus", "Honey",
    "Indie", "Jasper", "Kipper", "Luna", "Mango", "Nico", "Oakley", "Poppy", "Quill", "Rufus",
    "Sadie", "Teddy", "Ulla", "Vera", "Wilf", "Xena", "Yarrow", "Alder", "Bertie", "Coral",
    "Dottie", "Elm", "Fudge", "Gilly", "Hattie", "Iris", "Jolly", "Kit", "Lottie", "Mabel"
  ],

  guestThoughts: {
    happy: [
      "This is the best day out ever!",
      "What a lovely zoo.",
      "The {animal} looks so happy today.",
      "Brilliant, the kids love it here.",
      "Worth every penny."
    ],
    hungry: [
      "I could eat a horse.",
      "Where can I get a bite?",
      "My tummy is rumbling.",
      "Is there a burger stand nearby?",
      "I'm starving."
    ],
    thirsty: [
      "I'd love a cold drink.",
      "Is there water anywhere?",
      "So thirsty.",
      "Where's the nearest drinks stall?",
      "I could drink the lake."
    ],
    toilet: [
      "I need the loo, quickly!",
      "Where are the toilets?",
      "Desperately need a toilet.",
      "Please tell me there's a loo nearby.",
      "Can't wait much longer."
    ],
    bored: [
      "Nothing to see here.",
      "Is there anything to do?",
      "I'm getting bored.",
      "Where are the rides?",
      "This is a bit dull."
    ],
    tired: [
      "My feet are killing me.",
      "I need a sit down.",
      "Could really use a bench.",
      "So tired already.",
      "Time for a rest."
    ],
    dirty: [
      "This path is covered in litter.",
      "Who left this rubbish here?",
      "Yuck, the bins are overflowing.",
      "The place is a bit grubby.",
      "Somebody should sweep this up."
    ],
    animalsUnhappy: [
      "The {animal} looks miserable.",
      "Poor {animal}, it keeps pacing.",
      "Is the {animal} alright?",
      "That {animal} needs more space.",
      "I don't think the {animal} is happy."
    ],
    expensive: [
      "Tickets are a bit steep.",
      "That's a lot for a burger.",
      "Everything costs a fortune here.",
      "I'm watching my pennies.",
      "Too pricey for me today."
    ],
    cheap: [
      "Good value, this.",
      "Reasonable prices, I'll say that.",
      "Glad it doesn't cost the earth.",
      "Bargain!",
      "Fair price for a day out."
    ],
    crowded: [
      "Too many people here!",
      "I can't even see past the crowd.",
      "Let's go somewhere quieter.",
      "It's packed.",
      "Mind your elbows."
    ],
    escaped: [
      "Did you hear? The {animal} got out!",
      "Run! The {animal} is loose!",
      "Keepers are chasing the {animal}.",
      "Stay back from the fence!",
      "Is it safe here?"
    ],
    baby: [
      "Look, a baby {animal}!",
      "Aww, a new {animal} baby!",
      "So cute, a little {animal}.",
      "The baby {animal} is adorable.",
      "Tiny {animal}, how sweet."
    ],
    greatExhibit: [
      "This exhibit is incredible.",
      "I've never seen anything like it.",
      "Now that's a proper enclosure.",
      "Simply magnificent.",
      "Best exhibit in the zoo."
    ],
    cantSee: [
      "I can't see a thing!",
      "Could someone move, please?",
      "Is there a better viewpoint?",
      "Too much glass glare.",
      "Can't see over the fence."
    ],
    noBench: [
      "Where can I sit down?",
      "There's nowhere to rest.",
      "I'd sit down if there was a bench.",
      "Need a bench, please.",
      "My legs need a seat."
    ],
    leaving: [
      "Time to head home.",
      "That's us done for today.",
      "Ta-ra, see you next time.",
      "Off to find the car.",
      "Lovely day, goodbye!"
    ]
  },

  tips: [
    "Guests spend more when there is somewhere to sit nearby.",
    "Give each species the terrain, foliage and water it prefers.",
    "Fences strong enough for a species stop escapes.",
    "Place toilets and drinks stalls near busy paths.",
    "Empty bins and sweep paths to keep guests happy.",
    "Hire a vet before your big cats arrive.",
    "Check an enclosure report to see what its animals need.",
    "Higher ticket prices earn more but can upset guests.",
    "A great exhibit attracts donations from guests.",
    "Hedges and concrete block the view; glass and chain-link let guests see in.",
    "Your star rating unlocks new species and buildings.",
    "Breeding brings new animals to your zoo and pleases guests."
  ],

  events: [
    { id: "heatwave", text: "A heatwave sends temperatures soaring. Guests are thirstier than usual.", effect: { type: "guestThirst", amount: 20 } },
    { id: "rain", text: "Heavy rain keeps visitors indoors for the afternoon.", effect: { type: "guests", amount: -15 } },
    { id: "celebrity_visit", text: "A television presenter visits and films a segment at the zoo.", effect: { type: "guests", amount: 25 } },
    { id: "school_trip", text: "A school trip arrives, bringing a noisy but generous crowd.", effect: { type: "money", amount: 600 } },
    { id: "donation", text: "An anonymous donor leaves a generous envelope at the gate.", effect: { type: "money", amount: 1000 } },
    { id: "bin_fire", text: "A bin catches fire behind the café, and the sprinklers soak the path.", effect: { type: "cleanliness", amount: -10 } },
    { id: "vaccine", text: "A new vaccine boosts animal health across the zoo.", effect: { type: "animalHealth", amount: 5 } },
    { id: "storm_damage", text: "A storm snaps branches and knocks over a fence panel.", effect: { type: "fenceDamage", amount: 1 } }
  ]
};
