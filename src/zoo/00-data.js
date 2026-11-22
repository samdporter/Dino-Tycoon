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
    { id: "water", name: "Water", colour: "#3a86b8", cost: 30 },
    { id: "enchanted", name: "Enchanted glade", colour: "#78d6a8", cost: 35, star: 4 },
    { id: "misty_moor", name: "Misty moor", colour: "#566b78", cost: 30, star: 4 },
    { id: "starlight_sand", name: "Starlight sand", colour: "#d6b8f0", cost: 35, star: 4 },
    { id: "lava", name: "Volcanic lava", colour: "#f04e18", cost: 40, star: 4 }
  ],

  fences: [
    { id: "low_wood", name: "Low wooden fence", cost: 15, strength: 1, height: 0.9, seeThrough: true, style: "wood" },
    { id: "post_rail", name: "Post and rail", cost: 25, strength: 1, height: 1.2, seeThrough: true, style: "rail" },
    { id: "hedge", name: "Hedge", cost: 30, strength: 1, height: 1.8, seeThrough: false, style: "hedge" },
    { id: "chainlink", name: "Chain-link fence", cost: 45, strength: 3, height: 2.0, seeThrough: true, style: "chain" },
    { id: "glass", name: "Glass panel", cost: 75, strength: 3, height: 2.2, seeThrough: true, style: "glass" },
    { id: "reinforced", name: "Reinforced mesh", cost: 100, strength: 5, height: 2.5, seeThrough: true, style: "chain" },
    { id: "concrete", name: "Concrete wall", cost: 120, strength: 5, height: 3.0, seeThrough: false, style: "concrete" },
    { id: "cage", name: "Primate cage", cost: 110, strength: 4, height: 3.0, seeThrough: true, style: "cage", cage: true, info: "Tall wire-mesh enclosure with an overhead roof grid that keeps climbing primates safely inside." }
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
      lifespan: 900, breedChance: 0.1, star: 2, danger: 3, packHunter: true,
      fact: "Lions are the only cats that live in groups, known as prides."
    },
    {
      id: "elephant", name: "Elephant", emoji: "🐘", biome: "savannah",
      terrainPrefs: { savannah: 0.5, dirt: 0.2, water: 0.2, forest: 0.1 },
      cost: 12000, "upkeep/day": 300, appeal: 58, space: 12, social: [3, 10], diet: "herbivore",
      foliage: ["baobab", "acacia", "palm", "tall_grass"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.2, size: 3.2,
      lifespan: 3600, breedChance: 0.04, star: 3, danger: 3,
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
      lifespan: 960, breedChance: 0.06, star: 3, danger: 3,
      fact: "Each tiger's stripe pattern is unique, and their skin is striped too."
    },
    {
      id: "panda", name: "Giant panda", emoji: "🐼", biome: "forest",
      terrainPrefs: { forest: 0.6, rainforest: 0.2, rock: 0.2 },
      cost: 11000, "upkeep/day": 275, appeal: 60, space: 5, social: [1, 2], diet: "herbivore",
      foliage: ["bamboo", "fern"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 0.7, size: 0.7,
      lifespan: 1200, breedChance: 0.03, star: 3, danger: 1,
      fact: "Giant pandas can spend 10 to 16 hours a day eating bamboo."
    },
    {
      id: "gorilla", name: "Gorilla", emoji: "🦍", biome: "rainforest",
      terrainPrefs: { rainforest: 0.7, forest: 0.2, dirt: 0.1 },
      cost: 8000, "upkeep/day": 200, appeal: 52, space: 6, social: [2, 6], diet: "herbivore",
      foliage: ["jungle_tree", "fern", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.0, size: 0.9,
      lifespan: 2100, breedChance: 0.03, star: 2, danger: 2,
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
      lifespan: 780, breedChance: 0.1, star: 1, danger: 2, packHunter: true,
      fact: "Wolves howl to keep in touch with their pack across long distances."
    },
    {
      id: "brown_bear", name: "Brown bear", emoji: "🐻", biome: "forest",
      terrainPrefs: { forest: 0.5, rock: 0.2, grass: 0.2, water: 0.1 },
      cost: 4400, "upkeep/day": 110, appeal: 38, space: 8, social: [1, 2], diet: "omnivore",
      foliage: ["pine", "fern", "bush"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.2, size: 1.2,
      lifespan: 1500, breedChance: 0.06, star: 1, danger: 3,
      fact: "Brown bears can reach around 56 km/h (35 mph) over short distances."
    },
    {
      id: "polar_bear", name: "Polar bear", emoji: "🐻‍❄️", biome: "snow",
      terrainPrefs: { snow: 0.6, water: 0.3, rock: 0.1 },
      cost: 6500, "upkeep/day": 170, appeal: 50, space: 8, social: [1, 1], diet: "carnivore",
      foliage: ["ice_floe", "boulder"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 1.3, size: 1.4,
      lifespan: 1500, breedChance: 0.05, star: 2, danger: 3,
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
      lifespan: 1200, breedChance: 0.1, star: 1, danger: 1,
      fact: "Female kangaroos can pause a pregnancy, a process called embryonic diapause."
    },
    {
      id: "crocodile", name: "Nile crocodile", emoji: "🐊", biome: "water",
      terrainPrefs: { water: 0.5, dirt: 0.2, rainforest: 0.2, sand: 0.1 },
      cost: 4800, "upkeep/day": 120, appeal: 30, space: 4, social: [1, 4], diet: "carnivore",
      foliage: ["palm", "fern", "rock_pile", "bush"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 0.5, size: 0.5,
      lifespan: 2700, breedChance: 0.06, star: 1, danger: 3,
      fact: "Crocodiles cannot stick out their tongues, because the tongue is attached to the floor of the mouth."
    },
    {
      id: "jaguar", name: "Jaguar", emoji: "🐆", biome: "rainforest",
      terrainPrefs: { rainforest: 0.5, water: 0.25, forest: 0.15, rock: 0.1 },
      cost: 6200, "upkeep/day": 155, appeal: 54, space: 7, social: [1, 2], diet: "carnivore",
      foliage: ["jungle_tree", "fern", "boulder", "log"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.5, size: 0.95,
      lifespan: 960, breedChance: 0.08, star: 2, danger: 3,
      fact: "Unlike most big cats, jaguars love swimming and possess the strongest bite force relative to body size of any felid."
    },
    {
      id: "cheetah", name: "Cheetah", emoji: "🐆", biome: "savannah",
      terrainPrefs: { savannah: 0.65, grass: 0.2, dirt: 0.15 },
      cost: 8500, "upkeep/day": 210, appeal: 58, space: 9, social: [1, 4], diet: "carnivore",
      foliage: ["acacia", "tall_grass", "boulder", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, speed: 2.2, size: 0.9,
      lifespan: 840, breedChance: 0.07, star: 3, danger: 2,
      fact: "The fastest land animal on Earth can sprint up to 110 km/h in short bursts, using its long tail as a rudder."
    },
    {
      id: "anaconda", name: "Anaconda", emoji: "🐍", biome: "water",
      terrainPrefs: { water: 0.45, rainforest: 0.35, dirt: 0.2 },
      cost: 5200, "upkeep/day": 130, appeal: 48, space: 4, social: [1, 3], diet: "carnivore",
      foliage: ["jungle_tree", "fern", "log", "heat_rock"],
      needsWater: true, needsShelter: false, needsRocks: true, minFence: 4, speed: 0.6, size: 0.45,
      lifespan: 1500, breedChance: 0.07, star: 2, danger: 3,
      fact: "Green anacondas are the heaviest snakes in the world and spend much of their time gliding silently through shallow water."
    },
    {
      id: "hyena", name: "Spotted hyena", emoji: "🦴", biome: "savannah",
      terrainPrefs: { savannah: 0.55, dirt: 0.25, rock: 0.2 },
      cost: 4200, "upkeep/day": 105, appeal: 40, space: 6, social: [3, 10], diet: "carnivore",
      foliage: ["acacia", "boulder", "rock_pile", "tall_grass"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 1.5, size: 0.85,
      lifespan: 1080, breedChance: 0.1, star: 2, danger: 2, packHunter: true,
      fact: "Spotted hyenas live in complex, female-led clans and communicate across miles with eerie whoops and giggles."
    },
    {
      id: "monkey", name: "Monkey", emoji: "🐒", biome: "rainforest",
      terrainPrefs: { rainforest: 0.55, forest: 0.3, grass: 0.15 },
      cost: 2400, "upkeep/day": 60, appeal: 44, space: 3, social: [4, 14], diet: "omnivore",
      foliage: ["jungle_tree", "vine_perch", "climbing_frame", "tyre_swing", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 3, needsCage: true, speed: 1.3, size: 0.45,
      lifespan: 1200, breedChance: 0.14, star: 1, danger: 1,
      fact: "Nimble monkeys leap effortlessly between branches and will quickly scale any unroofed fence to explore the zoo."
    },
    {
      id: "chimpanzee", name: "Chimpanzee", emoji: "🐵", biome: "rainforest",
      terrainPrefs: { rainforest: 0.6, forest: 0.25, dirt: 0.15 },
      cost: 6800, "upkeep/day": 170, appeal: 54, space: 5, social: [3, 10], diet: "omnivore",
      foliage: ["jungle_tree", "vine_perch", "climbing_frame", "tyre_swing", "fern"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, needsCage: true, speed: 1.2, size: 0.75,
      lifespan: 2100, breedChance: 0.06, star: 2, danger: 2,
      fact: "Chimpanzees craft tools from twigs and leaves, share food with troopmates, and build fresh leafy sleeping nests each night."
    },
    {
      id: "lemur", name: "Ring-tailed lemur", emoji: "🐒", biome: "forest",
      terrainPrefs: { forest: 0.45, rainforest: 0.35, savannah: 0.2 },
      cost: 4600, "upkeep/day": 115, appeal: 50, space: 3, social: [4, 15], diet: "herbivore",
      foliage: ["jungle_tree", "vine_perch", "climbing_frame", "bush", "boulder"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 3, needsCage: true, speed: 1.25, size: 0.4,
      lifespan: 1080, breedChance: 0.12, star: 2, danger: 0,
      fact: "Ring-tailed lemurs sunbathe sitting upright with outstretched arms and hold their striped tails high like flags."
    },
    {
      id: "orangutan", name: "Orangutan", emoji: "🦧", biome: "rainforest",
      terrainPrefs: { rainforest: 0.7, forest: 0.2, dirt: 0.1 },
      cost: 10000, "upkeep/day": 250, appeal: 60, space: 6, social: [1, 3], diet: "herbivore",
      foliage: ["jungle_tree", "vine_perch", "climbing_frame", "tyre_swing", "fern"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, needsCage: true, speed: 0.9, size: 0.9,
      lifespan: 2400, breedChance: 0.04, star: 3, danger: 2,
      fact: "Orangutans are the largest tree-dwelling mammals on Earth, with arm spans reaching over two metres."
    },
    {
      id: "komodo_dragon", name: "Komodo dragon", emoji: "🦎", biome: "savannah",
      terrainPrefs: { savannah: 0.4, rock: 0.3, sand: 0.2, dirt: 0.1 },
      cost: 8800, "upkeep/day": 220, appeal: 56, space: 6, social: [1, 2], diet: "carnivore",
      foliage: ["heat_rock", "boulder", "rock_pile", "palm", "bush"],
      needsWater: false, needsShelter: false, needsRocks: true, minFence: 4, speed: 0.85, size: 0.65,
      lifespan: 1800, breedChance: 0.05, star: 3, danger: 3,
      fact: "The world's largest living lizard tracks scent molecules on its forked tongue from kilometres away."
    },
    {
      id: "tortoise", name: "Giant tortoise", emoji: "🐢", biome: "grass",
      terrainPrefs: { grass: 0.45, sand: 0.3, dirt: 0.25 },
      cost: 600, "upkeep/day": 15, appeal: 26, space: 2, social: [1, 6], diet: "herbivore",
      foliage: ["tall_grass", "bush", "boulder", "heat_rock"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 1, speed: 0.35, size: 0.45,
      lifespan: 4500, breedChance: 0.06, star: 0, danger: 0,
      fact: "Giant tortoises can live well over a century and spend hours basking on warm rocks to regulate their body temperature."
    },
    {
      id: "peacock", name: "Peacock", emoji: "🦚", biome: "grass",
      terrainPrefs: { grass: 0.5, forest: 0.3, dirt: 0.2 },
      cost: 750, "upkeep/day": 18, appeal: 36, space: 2, social: [2, 8], diet: "omnivore",
      foliage: ["oak", "bush", "tall_grass"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 1, speed: 0.9, size: 0.55,
      lifespan: 1200, breedChance: 0.14, star: 0, danger: 0,
      fact: "A peacock's iridescent tail fan can span over a metre and is made of more than 150 eyespotted feathers."
    },
    {
      id: "capybara", name: "Capybara", emoji: "🐹", biome: "water",
      terrainPrefs: { water: 0.45, grass: 0.35, rainforest: 0.2 },
      cost: 900, "upkeep/day": 22, appeal: 42, space: 3, social: [3, 12], diet: "herbivore",
      foliage: ["tall_grass", "fern", "bush", "log"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 0.85, size: 0.5,
      lifespan: 900, breedChance: 0.16, star: 0, danger: 0,
      fact: "The world's largest rodent is a natural swimmer with slightly webbed feet and eyes set high on its head."
    },
    {
      id: "alpaca", name: "Alpaca", emoji: "🦙", biome: "grass",
      terrainPrefs: { grass: 0.55, rock: 0.25, dirt: 0.2 },
      cost: 850, "upkeep/day": 20, appeal: 32, space: 3, social: [3, 10], diet: "herbivore",
      foliage: ["tall_grass", "bush", "rock_pile"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 1, speed: 1.0, size: 0.95,
      lifespan: 1500, breedChance: 0.12, star: 0, danger: 0,
      fact: "Domesticated in the high Andes thousands of years ago, alpacas hum softly to keep in touch with their herd."
    },
    {
      id: "fennec_fox", name: "Fennec fox", emoji: "🦊", biome: "sand",
      terrainPrefs: { sand: 0.65, savannah: 0.2, rock: 0.15 },
      cost: 1600, "upkeep/day": 40, appeal: 46, space: 2, social: [2, 8], diet: "omnivore",
      foliage: ["cactus", "rock_pile", "heat_rock", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 2, speed: 1.4, size: 0.32,
      lifespan: 960, breedChance: 0.14, star: 1, danger: 0,
      fact: "The smallest of all foxes uses its oversized ears to radiate excess desert heat and listen for insects underground."
    },
    {
      id: "otter", name: "Giant otter", emoji: "🦦", biome: "water",
      terrainPrefs: { water: 0.55, forest: 0.25, rock: 0.2 },
      cost: 1900, "upkeep/day": 48, appeal: 48, space: 3, social: [2, 8], diet: "piscivore",
      foliage: ["log", "rock_pile", "fern", "tall_grass"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 2, speed: 1.25, size: 0.45,
      lifespan: 1080, breedChance: 0.12, star: 1, danger: 0,
      fact: "South American giant otters hunt in vocal family groups and can grow up to 1.8 metres long from nose to tail."
    },
    {
      id: "koala", name: "Koala", emoji: "🐨", biome: "forest",
      terrainPrefs: { forest: 0.6, grass: 0.25, savannah: 0.15 },
      cost: 2200, "upkeep/day": 55, appeal: 52, space: 3, social: [1, 4], diet: "herbivore",
      foliage: ["oak", "jungle_tree", "climbing_frame", "bush"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 2, speed: 0.55, size: 0.5,
      lifespan: 1200, breedChance: 0.08, star: 1, danger: 0,
      fact: "Koalas sleep up to 20 hours a day to conserve energy while digesting tough, fibrous leaves."
    },
    {
      id: "arctic_fox", name: "Arctic fox", emoji: "🦊", biome: "snow",
      terrainPrefs: { snow: 0.65, rock: 0.25, forest: 0.1 },
      cost: 2000, "upkeep/day": 50, appeal: 46, space: 3, social: [2, 6], diet: "carnivore",
      foliage: ["snow_pine", "ice_floe", "boulder"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 3, speed: 1.45, size: 0.45,
      lifespan: 900, breedChance: 0.12, star: 1, danger: 1, packHunter: true,
      fact: "Arctic foxes change coat colour with the seasons, turning snowy white in winter and earthy brown in summer."
    },
    {
      id: "unicorn", name: "Unicorn", emoji: "🦄", biome: "enchanted",
      terrainPrefs: { enchanted: 0.5, grass: 0.25, starlight_sand: 0.15, water: 0.1 },
      cost: 12000, "upkeep/day": 150, appeal: 95, space: 26, social: [1, 4], diet: "herbivore",
      foliage: ["enchanted_tree", "glowing_mushroom", "rainbow_arch", "crystal_cluster"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 3, speed: 1.7, size: 1.4,
      lifespan: 1800, breedChance: 0.05, star: 4, danger: 0, fantasy: true,
      fact: "A mythical white steed with a spiralling golden horn; unicorns thrive in shimmering enchanted glades."
    },
    {
      id: "winged_monkey", name: "Winged monkey", emoji: "🦇", biome: "misty_moor",
      terrainPrefs: { misty_moor: 0.45, rock: 0.25, enchanted: 0.2, forest: 0.1 },
      cost: 9500, "upkeep/day": 130, appeal: 86, space: 18, social: [2, 6], diet: "omnivore",
      foliage: ["enchanted_tree", "standing_stones", "crystal_cluster", "wizard_shelter"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 3, speed: 1.8, size: 0.9,
      lifespan: 1100, breedChance: 0.08, star: 4, danger: 1, canFlyOver: true, fantasy: true,
      fact: "Straight out of Oz, these bat-winged monkeys love dramatic swoops over fences to startle guests before flapping smugly back home."
    },
    {
      id: "sasquatch", name: "Sasquatch", emoji: "🦶", biome: "forest",
      terrainPrefs: { forest: 0.45, misty_moor: 0.35, rock: 0.2 },
      cost: 11000, "upkeep/day": 140, appeal: 90, space: 30, social: [1, 2], diet: "omnivore",
      foliage: ["pine", "glowing_mushroom", "standing_stones", "boulder"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 1.3, size: 1.8,
      lifespan: 1600, breedChance: 0.04, star: 4, danger: 1, fantasy: true,
      fact: "A towering, elusive woodland cryptid that prefers misty pines, ancient stones and plenty of privacy."
    },
    {
      id: "nessie", name: "Loch Ness monster", emoji: "🦕", biome: "water",
      terrainPrefs: { water: 0.7, misty_moor: 0.2, rock: 0.1 },
      cost: 14000, "upkeep/day": 175, appeal: 98, space: 34, social: [1, 2], diet: "piscivore",
      foliage: ["standing_stones", "boulder", "tall_grass", "glowing_mushroom"],
      needsWater: true, needsShelter: false, needsRocks: true, minFence: 3, speed: 1.25, size: 2.0,
      lifespan: 2000, breedChance: 0.03, star: 4, danger: 0, fantasy: true,
      fact: "Scotland's legendary lake serpent glides gracefully through deep lochs, delighting guests whenever its arched humps surface."
    },
    {
      id: "phoenix", name: "Phoenix", emoji: "🔥", biome: "starlight_sand",
      terrainPrefs: { starlight_sand: 0.45, rock: 0.3, enchanted: 0.25 },
      cost: 13500, "upkeep/day": 165, appeal: 97, space: 22, social: [1, 2], diet: "herbivore",
      foliage: ["crystal_cluster", "rainbow_arch", "heat_rock", "enchanted_tree"],
      needsWater: false, needsShelter: false, needsRocks: true, minFence: 3, speed: 1.6, size: 1.15,
      lifespan: 2400, breedChance: 0.05, star: 4, danger: 0, fantasy: true,
      fact: "A radiant firebird of legend whose golden plumage glows brightest among crystal spires and starlight dunes."
    },
    {
      id: "griffin", name: "Griffin", emoji: "🦅", biome: "misty_moor",
      terrainPrefs: { misty_moor: 0.4, rock: 0.35, enchanted: 0.25 },
      cost: 12500, "upkeep/day": 160, appeal: 94, space: 28, social: [1, 3], diet: "carnivore",
      foliage: ["standing_stones", "boulder", "crystal_cluster", "wizard_shelter"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 1.55, size: 1.5,
      lifespan: 1500, breedChance: 0.04, star: 4, danger: 2, fantasy: true,
      fact: "Half lion and half eagle, the noble griffin guards rocky crags and misty moors with fierce majesty."
    },
    {
      id: "puss_in_boots", name: "Puss in Boots", emoji: "👢", biome: "enchanted",
      terrainPrefs: { enchanted: 0.45, lava: 0.3, grass: 0.15, forest: 0.1 },
      cost: 12500, "upkeep/day": 155, appeal: 96, space: 20, social: [1, 4], diet: "carnivore",
      foliage: ["castle", "enchanted_tree", "wizard_shelter", "rainbow_arch", "climbing_frame", "ball"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 3, speed: 1.75, size: 0.75,
      lifespan: 1600, breedChance: 0.06, star: 4, danger: 1, fantasy: true, companion: "purple_dragon",
      fixedSex: "m", maxCount: 1, companionGroup: "puss_dragon",
      fact: "A dashing storybook swordsman in plumed hat and polished boots who charms crowds with dramatic bows and refuses to leave his purple dragon companion."
    },
    {
      id: "purple_dragon", name: "Purple dragon", emoji: "🐉", biome: "enchanted",
      terrainPrefs: { lava: 0.5, enchanted: 0.35, rock: 0.15 },
      cost: 16000, "upkeep/day": 200, appeal: 110, space: 36, social: [1, 3], diet: "carnivore",
      foliage: ["castle", "standing_stones", "crystal_cluster", "heat_rock"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 5, speed: 1.4, size: 4.2,
      lifespan: 3000, breedChance: 0.04, star: 4, danger: 3, fantasy: true, companion: "puss_in_boots",
      fixedSex: "f", maxCount: 1, companionGroup: "puss_dragon",
      fact: "An enormous, amethyst-scaled fairytale dragon who towers over every exhibit and will only be happy when sharing her castle with Puss in Boots."
    },
    {
      id: "pugon", name: "Pugon", emoji: "🦁", biome: "enchanted",
      terrainPrefs: { enchanted: 0.45, lava: 0.4, rock: 0.1, grass: 0.05 },
      cost: 14500, "upkeep/day": 145, appeal: 108, space: 12, social: [1, 20], diet: "carnivore",
      foliage: ["castle", "enchanted_tree", "wizard_shelter", "crystal_cluster", "standing_stones", "heat_rock", "rainbow_arch", "climbing_frame", "ball"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.7, size: 1.05,
      lifespan: 2400, breedChance: 0, star: 4, danger: 2, fantasy: true,
      breedOnly: true, fixedSex: "m", companionGroup: "puss_dragon",
      fact: "A dashing dragon-kitten hybrid born to Puss in Boots and Purple Dragon — sporting amethyst scales, golden boots, and a feathered swashbuckler hat."
    },
    {
      id: "drassy", name: "Drassy", emoji: "🐲", biome: "enchanted",
      terrainPrefs: { lava: 0.45, enchanted: 0.4, rock: 0.15 },
      cost: 15500, "upkeep/day": 155, appeal: 112, space: 14, social: [1, 20], diet: "carnivore",
      foliage: ["castle", "enchanted_tree", "crystal_cluster", "standing_stones", "heat_rock", "wizard_shelter"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 1.65, size: 1.25,
      lifespan: 2600, breedChance: 0, star: 4, danger: 2, fantasy: true,
      breedOnly: true, fixedSex: "f", companionGroup: "puss_dragon",
      fact: "A spirited fairytale dragonet daughter of Purple Dragon and Puss in Boots, with iridescent violet wings and a fearless storybook strut."
    }
  ],

  scenery: [
    { id: "oak", name: "Oak tree", emoji: "🌳", cost: 120, kind: "tree", cat: "plant", biome: "forest", aesthetic: 3, inEnclosure: true, terrains: ["grass", "forest", "dirt"] },
    { id: "pine", name: "Pine tree", emoji: "🌲", cost: 130, kind: "tree", cat: "plant", biome: "forest", aesthetic: 3, inEnclosure: true, terrains: ["forest", "grass", "rock", "snow"] },
    { id: "acacia", name: "Acacia tree", emoji: "🌳", cost: 120, kind: "tree", cat: "plant", biome: "savannah", aesthetic: 3, inEnclosure: true, terrains: ["savannah", "sand", "dirt"] },
    { id: "palm", name: "Palm tree", emoji: "🌴", cost: 140, kind: "tree", cat: "plant", biome: "sand", aesthetic: 3, inEnclosure: true, terrains: ["sand", "dirt", "grass"] },
    { id: "bamboo", name: "Bamboo grove", emoji: "🎍", cost: 90, kind: "tree", cat: "plant", biome: "forest", aesthetic: 3, inEnclosure: true, terrains: ["forest", "rainforest", "dirt"] },
    { id: "baobab", name: "Baobab tree", emoji: "🌳", cost: 350, kind: "tree", cat: "plant", biome: "savannah", aesthetic: 4, inEnclosure: true, terrains: ["savannah", "sand", "dirt"] },
    { id: "cactus", name: "Cactus", emoji: "🌵", cost: 60, kind: "bush", cat: "plant", biome: "sand", aesthetic: 2, inEnclosure: true, terrains: ["sand", "savannah", "rock"] },
    { id: "snow_pine", name: "Snow pine", emoji: "🌲", cost: 130, kind: "tree", cat: "plant", biome: "snow", aesthetic: 3, inEnclosure: true, terrains: ["snow", "rock", "forest"] },
    { id: "jungle_tree", name: "Jungle tree", emoji: "🌴", cost: 220, kind: "tree", cat: "plant", biome: "rainforest", aesthetic: 4, inEnclosure: true, terrains: ["rainforest", "grass", "dirt"] },
    { id: "bush", name: "Shrub", emoji: "🌿", cost: 25, kind: "bush", cat: "plant", biome: "any", aesthetic: 2, inEnclosure: true, terrains: ["grass", "savannah", "forest", "dirt", "rainforest"] },
    { id: "fern", name: "Fern", emoji: "🌿", cost: 20, kind: "bush", cat: "plant", biome: "rainforest", aesthetic: 2, inEnclosure: true, terrains: ["rainforest", "grass", "forest", "dirt"] },
    { id: "tall_grass", name: "Tall grass", emoji: "🌾", cost: 10, kind: "bush", cat: "plant", biome: "any", aesthetic: 1, inEnclosure: true, terrains: ["grass", "savannah", "dirt"] },
    { id: "boulder", name: "Boulder", emoji: "🪨", cost: 80, kind: "rock", biome: "rock", aesthetic: 2, inEnclosure: true },
    { id: "rock_pile", name: "Rock pile", emoji: "🪨", cost: 50, kind: "rock", biome: "rock", aesthetic: 2, inEnclosure: true },
    { id: "ice_floe", name: "Ice floe", emoji: "🧊", cost: 90, kind: "rock", biome: "snow", aesthetic: 2, inEnclosure: true },
    { id: "log", name: "Fallen log", emoji: "🪵", cost: 40, kind: "deco", biome: "forest", aesthetic: 2, inEnclosure: true },
    { id: "cave_shelter", name: "Cave shelter", emoji: "🕳️", cost: 400, kind: "shelter", biome: "rock", aesthetic: 3, inEnclosure: true },
    { id: "wooden_shelter", name: "Wooden shelter", emoji: "🛖", cost: 250, kind: "shelter", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "heat_rock", name: "Heat rock", emoji: "☀️", cost: 180, kind: "rock", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "climbing_frame", name: "Climbing frame", emoji: "🪜", cost: 350, kind: "toy", biome: "any", aesthetic: 3, inEnclosure: true },
    { id: "vine_perch", name: "Climbing vines", emoji: "🪢", cost: 160, kind: "toy", biome: "rainforest", aesthetic: 3, inEnclosure: true },
    { id: "tyre_swing", name: "Tyre swing", emoji: "🛞", cost: 120, kind: "toy", biome: "any", aesthetic: 2, inEnclosure: true },
    { id: "ball", name: "Ball", emoji: "⚽", cost: 30, kind: "toy", biome: "any", aesthetic: 1, inEnclosure: true },
    { id: "bench", name: "Bench", emoji: "🪑", cost: 150, kind: "deco", biome: "any", aesthetic: 2, inEnclosure: false },
    { id: "lamp", name: "Lamp post", emoji: "💡", cost: 90, kind: "deco", biome: "any", aesthetic: 2, inEnclosure: false },
    { id: "flower_bed", name: "Flower bed", emoji: "🌷", cost: 60, kind: "deco", biome: "grass", aesthetic: 3, inEnclosure: false },
    { id: "fountain", name: "Fountain", emoji: "⛲", cost: 800, kind: "deco", biome: "any", aesthetic: 5, inEnclosure: false },
    { id: "bin", name: "Litter bin", emoji: "🗑️", cost: 40, kind: "deco", biome: "any", aesthetic: 0, inEnclosure: false },
    { id: "statue", name: "Statue", emoji: "🗿", cost: 500, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false },
    { id: "picnic_table", name: "Picnic table", emoji: "🧺", cost: 110, kind: "deco", biome: "grass", aesthetic: 2, inEnclosure: false },
    { id: "sign", name: "Information sign", emoji: "🪧", cost: 45, kind: "deco", biome: "any", aesthetic: 1, inEnclosure: false },
    { id: "themepark_arch", name: "Midway Welcome Arch", emoji: "🎪", cost: 450, kind: "deco", biome: "any", aesthetic: 5, inEnclosure: false, star: 0, themepark: true, info: "Festive illuminated fairground archway welcoming guests to the midway." },
    { id: "bunting_poles", name: "Carnival Bunting Flags", emoji: "🎏", cost: 140, kind: "deco", biome: "any", aesthetic: 3, inEnclosure: false, star: 0, themepark: true, info: "Colourful triangular pennant flags strung between striped carnival poles." },
    { id: "funhouse_mirror", name: "Funhouse Mirrors", emoji: "🪞", cost: 220, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false, star: 0, themepark: true, info: "Wavy gilt-framed laughing mirrors that amuse passing guests." },
    { id: "balloon_arch", name: "Balloon Archway", emoji: "🎈", cost: 280, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false, star: 0, themepark: true, info: "Bright rainbow cluster arch of helium carnival balloons." },
    { id: "circus_lamp", name: "Festoon String Lights", emoji: "🏮", cost: 160, kind: "deco", biome: "any", aesthetic: 3, inEnclosure: false, star: 0, themepark: true, info: "Warm glowing fairground festoon bulbs on a striped pole." },
    { id: "clown_statue", name: "Jester Mascot Statue", emoji: "🤡", cost: 420, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false, star: 1, themepark: true, info: "Cheerful golden theme-park mascot statue on a striped plinth." },
    { id: "enchanted_tree", name: "Enchanted tree", emoji: "🌸", cost: 260, kind: "tree", biome: "enchanted", aesthetic: 7, inEnclosure: true, star: 4 },
    { id: "glowing_mushroom", name: "Glowing mushrooms", emoji: "🍄", cost: 140, kind: "bush", biome: "enchanted", aesthetic: 5, inEnclosure: true, star: 4 },
    { id: "crystal_cluster", name: "Crystal cluster", emoji: "💎", cost: 280, kind: "rock", biome: "starlight_sand", aesthetic: 7, inEnclosure: true, star: 4 },
    { id: "standing_stones", name: "Standing stones", emoji: "🪨", cost: 320, kind: "rock", biome: "misty_moor", aesthetic: 7, inEnclosure: true, star: 4 },
    { id: "rainbow_arch", name: "Rainbow arch", emoji: "🌈", cost: 450, kind: "toy", biome: "enchanted", aesthetic: 8, inEnclosure: true, star: 4 },
    { id: "wizard_shelter", name: "Wizard's tower", emoji: "🏰", cost: 650, kind: "shelter", biome: "enchanted", aesthetic: 6, inEnclosure: true, star: 4 },
    { id: "castle", name: "Castle", emoji: "🏰", cost: 950, kind: "shelter", biome: "enchanted", aesthetic: 8, inEnclosure: true, star: 4,
      info: "A grand stone fairytale fortress with corner turrets, battlements and glowing windows — a prized shelter for dragons and storybook companions." }
  ],

  maps: [
    {
      id: "meadow",
      name: "Grassland Sanctuary",
      sub: "Medium (48×48)",
      desc: "The classic start: 48 by 48 tiles of gentle green meadow with a few low rises, a pond and plenty of room to grow your zoo.",
      bounds: { i0: 4, j0: 8, i1: 51, j1: 55 },
      cashBonus: 0,
      palette: ["grass", "dirt", "forest"],
      size: "Medium",
      blurb: "The classic start: 48 by 48 tiles of gentle green meadow with a few low rises, a pond and plenty of room to grow your zoo.",
      gen: {
        base: "grass", hills: { amp: 2, scale: 14 }, lakes: { n: 1, r: [3, 4], depth: 2 },
        paint: [{ t: "dirt", n: 0.7, s: 6 }, { t: "forest", n: 0.66, s: 10 }],
        scatter: [["oak", 8, ["grass", "forest"]], ["pine", 8, ["forest", "grass"]], ["bush", 10, ["grass", "forest"]], ["fern", 8, ["grass", "forest"]], ["tall_grass", 6, ["grass", "dirt"]], ["boulder", 4, ["grass"]]]
      }
    },
    {
      id: "pocket",
      name: "Pocket Reserve",
      sub: "Small (30×30)",
      desc: "A cramped 30 by 30 plot of flat, affordable land. Every tile counts, so plan your animal enclosures carefully.",
      bounds: { i0: 13, j0: 26, i1: 42, j1: 55 },
      cashBonus: 0,
      palette: ["grass", "dirt"],
      size: "Small",
      blurb: "A cramped 30 by 30 plot of flat, affordable land. Every tile counts, so plan your animal enclosures carefully.",
      gen: {
        base: "grass", hills: { amp: 0, scale: 10 },
        paint: [{ t: "dirt", n: 0.78, s: 5 }],
        scatter: [["oak", 3, ["grass"]], ["bush", 5, ["grass"]], ["fern", 3, ["grass"]], ["boulder", 2, ["grass"]]]
      }
    },
    {
      id: "lakeland",
      name: "Riverlands Delta",
      sub: "Large (56×50)",
      desc: "A sprawling 56 by 50 floodplain dotted with lakes and waterways. Perfect for aquatic animals and wading birds.",
      bounds: { i0: 0, j0: 6, i1: 55, j1: 55 },
      cashBonus: 0,
      palette: ["grass", "water", "rainforest", "dirt", "forest"],
      size: "Large",
      blurb: "A sprawling 56 by 50 floodplain dotted with lakes and waterways. Perfect for aquatic animals and wading birds.",
      gen: {
        base: "grass", hills: { amp: 1.5, scale: 12 }, lakes: { n: 6, r: [4, 7], depth: 2 },
        paint: [{ t: "rainforest", n: 0.68, s: 9 }, { t: "dirt", n: 0.74, s: 6 }, { t: "forest", n: 0.7, s: 12 }],
        scatter: [["tall_grass", 20, ["dirt", "grass"]], ["jungle_tree", 6, ["rainforest"]], ["oak", 8, ["grass", "forest"]], ["pine", 6, ["forest"]], ["fern", 10, ["rainforest", "grass"]], ["bush", 8, ["grass"]]]
      }
    },
    {
      id: "highland",
      name: "Highland Ridge",
      sub: "Large (52×54)",
      desc: "Rolling uplands, a long cliff line to the north and stony slopes under woodland. Dramatic, rugged habitat for mountain fauna.",
      bounds: { i0: 2, j0: 2, i1: 53, j1: 55 },
      cashBonus: 0,
      palette: ["grass", "rock", "forest"],
      size: "Large",
      blurb: "Rolling uplands, a long cliff line to the north and stony slopes under woodland. Dramatic, rugged habitat for mountain fauna.",
      gen: {
        base: "grass", hills: { amp: 4, scale: 11 }, ridge: { j: 22, wave: 4, h: 6, ramps: [14, 41] },
        paint: [{ t: "rock", hi: 4 }, { t: "forest", n: 0.52, s: 9 }, { t: "rock", n: 0.82, s: 5 }],
        scatter: [["pine", 24, ["forest", "grass", "rock"]], ["snow_pine", 4, ["rock"]], ["boulder", 14, ["rock", "grass", "forest"]], ["rock_pile", 12, ["rock", "grass"]], ["bush", 10, ["grass", "forest"]], ["fern", 6, ["forest"]], ["log", 5, ["forest"]]]
      }
    },
    {
      id: "gulch",
      name: "Savannah Canyon",
      sub: "Medium (44×50)",
      desc: "Sun-baked savannah and sand, split by a deep canyon and studded with flat-topped mesas. Ideal for African plains species.",
      bounds: { i0: 6, j0: 6, i1: 49, j1: 55 },
      cashBonus: 0,
      palette: ["savannah", "sand", "dirt", "rock"],
      size: "Medium",
      blurb: "Sun-baked savannah and sand, split by a deep canyon and studded with flat-topped mesas. Ideal for African plains species.",
      gen: {
        base: "savannah", hills: { amp: 1.5, scale: 13 }, canyon: { j: 25, wave: 4, w: 3, depth: 4, ramps: [14, 38] }, mesas: { n: 4, r: 4.5, h: 4 },
        paint: [{ t: "sand", n: 0.64, s: 8 }, { t: "dirt", lo: -2 }, { t: "rock", hi: 3 }],
        scatter: [["acacia", 16, ["savannah", "sand", "dirt"]], ["baobab", 4, ["savannah"]], ["cactus", 6, ["sand"]], ["bush", 8, ["savannah"]], ["boulder", 10, ["rock", "savannah", "sand"]], ["rock_pile", 8, ["rock", "savannah", "sand"]], ["tall_grass", 6, ["dirt", "savannah"]]]
      }
    },
    {
      id: "frost",
      name: "Alpine Tundra",
      sub: "Medium (46×48)",
      desc: "A frozen plateau of snowdrifts and conifer stands, with icy tarns and rocky knolls. Cold paradise for polar bears and penguins.",
      bounds: { i0: 5, j0: 8, i1: 50, j1: 55 },
      cashBonus: 0,
      palette: ["snow", "rock", "forest", "water"],
      size: "Medium",
      blurb: "A frozen plateau of snowdrifts and conifer stands, with icy tarns and rocky knolls. Cold paradise for polar bears and penguins.",
      gen: {
        base: "snow", hills: { amp: 3, scale: 12 }, lakes: { n: 3, r: [3, 5], depth: 2 },
        paint: [{ t: "forest", n: 0.58, s: 8 }, { t: "rock", hi: 4 }],
        scatter: [["snow_pine", 26, ["snow", "forest", "rock"]], ["pine", 8, ["forest"]], ["ice_floe", 6, ["water"]], ["boulder", 8, ["snow", "rock"]], ["rock_pile", 6, ["snow", "rock"]], ["fern", 4, ["forest"]], ["bush", 4, ["forest"]]]
      }
    }
  ],

  mapSizes: [
    { id: "small", name: "Small", n: 40, blurb: "40×40 — cozy, tight layout" },
    { id: "medium", name: "Medium", n: 56, blurb: "56×56 — classic balanced zoo" },
    { id: "large", name: "Large", n: 72, blurb: "72×72 — sprawling grounds" },
    { id: "huge", name: "Huge", n: 88, blurb: "88×88 — massive mega-zoo" }
  ],

  buildings: [
    { id: "burger_stand", name: "Burger stand", emoji: "🍔", cost: 1200, upkeep: 20, type: "food", price: 6, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.5 }, star: 0 },
    { id: "pizza_hut", name: "Pizza kiosk", emoji: "🍕", cost: 1800, upkeep: 30, type: "food", price: 8, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.6 }, star: 0 },
    { id: "ice_cream", name: "Ice cream kiosk", emoji: "🍦", cost: 600, upkeep: 12, type: "food", price: 4, capacity: 3, w: 1, h: 1, satisfies: { hunger: 0.2, fun: 0.1 }, star: 0 },
    { id: "drinks_stall", name: "Drinks stall", emoji: "🥤", cost: 500, upkeep: 8, type: "drink", price: 3, capacity: 4, w: 1, h: 1, satisfies: { thirst: 0.6 }, star: 0 },
    { id: "coffee_cart", name: "Coffee cart", emoji: "☕", cost: 700, upkeep: 10, type: "drink", price: 4, capacity: 3, w: 1, h: 1, satisfies: { thirst: 0.4, energy: 0.3 }, star: 0 },
    { id: "toilets", name: "Toilets", emoji: "🚻", cost: 400, upkeep: 6, type: "toilet", price: 0, capacity: 6, w: 1, h: 1, satisfies: { bladder: 1 }, star: 0 },
    { id: "gift_shop", name: "Gift shop", emoji: "🎁", cost: 1500, upkeep: 20, type: "shop", price: 12, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.2 }, star: 1 },
    { id: "balloon_stand", name: "Balloon stand", emoji: "🎈", cost: 350, upkeep: 5, type: "shop", price: 5, capacity: 2, w: 1, h: 1, satisfies: { fun: 0.2 }, star: 0, themepark: true },
    { id: "carousel", name: "Carousel", emoji: "🎠", cost: 5000, upkeep: 70, type: "ride", price: 6, capacity: 12, w: 2, h: 2, satisfies: { fun: 0.8 }, star: 2, themepark: true },
    { id: "info_kiosk", name: "Info kiosk", emoji: "ℹ️", cost: 300, upkeep: 4, type: "info", price: 0, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.05 }, star: 0 },
    { id: "viewing_platform", name: "Viewing Tower", icon: "tower", emoji: "🔭", cost: 950, upkeep: 30, type: "info", price: 0, capacity: 20, w: 2, d: 2, h: 2, color: 0x7b6248, roof: 0x4d7c47, appeal: 14, boost: { fun: 20 }, satisfies: { fun: 0.3 }, star: 0, info: "Elevated lookout platform giving guests panoramic views over adjacent enclosures." },
    { id: "restaurant", name: "Restaurant", emoji: "🍽️", cost: 8000, upkeep: 120, type: "food", price: 14, capacity: 30, w: 2, h: 2, satisfies: { hunger: 1, thirst: 0.3, energy: 0.3 }, star: 3 },
    { id: "keeper_hut", name: "Keeper hut", emoji: "🛖", cost: 800, upkeep: 8, type: "staff", price: 0, capacity: 4, w: 1, h: 1, satisfies: {}, star: 0,
      info: "Keeper dispatch hub: speeds up Keeper care park-wide and adds a 48-tile fast-response station zone. Entrance must touch a path." },
    { id: "vet_clinic", name: "Vet clinic", emoji: "🏥", cost: 3500, upkeep: 50, type: "staff", price: 0, capacity: 4, w: 2, h: 2, satisfies: {}, star: 1,
      info: "Veterinary clinic & triage hub: speeds up Vet treatment park-wide and adds a 48-tile full-recovery zone. Entrance must touch a path." },
    { id: "education_centre", name: "Education centre", emoji: "🎓", cost: 5000, upkeep: 60, type: "info", price: 3, capacity: 40, w: 2, h: 2, satisfies: { fun: 0.5 }, star: 2 },
    { id: "emergency_bunker", name: "Emergency Shelter", icon: "bunker", emoji: "🚨", cost: 850, upkeep: 25, type: "info", price: 0, capacity: 30, w: 2, d: 2, h: 2, color: 0x6a7882, roof: 0xd8623b, appeal: 4, satisfies: {}, star: 1, info: "Reinforced guest shelter used during dangerous animal escapes and park lockdowns." },
    { id: "wooden_coaster", name: "Wooden Rollercoaster", emoji: "🎢", cost: 7500, upkeep: 95, type: "ride", rideKind: "coaster", thrill: 3, price: 10, capacity: 16, w: 3, h: 3, satisfies: { fun: 0.95 }, star: 2, themepark: true, legacyCoaster: true, info: "Classic timber rollercoaster with rattling lift hill, camelback drops and screaming guests." },
    { id: "loop_coaster", name: "Steel Loop Coaster", emoji: "➿", cost: 11000, upkeep: 140, type: "ride", rideKind: "coaster", thrill: 5, price: 14, capacity: 20, w: 4, h: 3, satisfies: { fun: 1.0 }, star: 3, themepark: true, legacyCoaster: true, info: "High-speed steel inversion coaster with a towering vertical loop and banked helix." },
    { id: "mine_coaster", name: "Runaway Mine Train", emoji: "🛤️", cost: 6200, upkeep: 80, type: "ride", rideKind: "coaster", thrill: 2, price: 8, capacity: 14, w: 3, h: 2, satisfies: { fun: 0.85 }, star: 1, themepark: true, legacyCoaster: true, info: "Family rocky canyon mine-cart coaster spiralling around craggy boulders." },
    { id: "log_flume", name: "Splash Log Flume", emoji: "🪵", cost: 8500, upkeep: 110, type: "ride", rideKind: "coaster", thrill: 3, price: 11, capacity: 16, w: 3, h: 3, satisfies: { fun: 0.92, thirst: 0.1 }, star: 2, themepark: true, legacyCoaster: true, info: "Elevated water chute ride ending in a refreshing splashdown drop." },
    { id: "coaster_wooden", name: "Wooden Coaster Station", emoji: "🎢", cost: 3200, upkeep: 45, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "wooden", thrill: 2, price: 8, capacity: 20, w: 4, h: 2, satisfies: { fun: 0.95 }, star: 0, themepark: true, info: "Place this entrance station and drag custom wooden coaster track in a loop back to the station. Raise hills and add Chain Lifts!" },
    { id: "coaster_mine", name: "Mine Train Station", emoji: "⛏️", cost: 4200, upkeep: 55, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "mine", thrill: 3, price: 10, capacity: 20, w: 4, h: 2, satisfies: { fun: 0.94 }, star: 1, themepark: true, info: "Custom rugged mine-cart coaster station. Supports hills, Chain Lifts and Launch Boosts." },
    { id: "coaster_flume", name: "Log Flume Station", emoji: "🪵", cost: 5000, upkeep: 65, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "flume", thrill: 3, price: 11, capacity: 16, w: 4, h: 2, satisfies: { fun: 0.96, thirst: 0.12 }, star: 2, themepark: true, info: "Custom elevated water-chute station. Pair high drops with Water Splash troughs for massive guest thrills." },
    { id: "coaster_steel", name: "Steel Thrill Coaster Station", emoji: "⚡", cost: 6800, upkeep: 85, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "steel", thrill: 5, price: 14, capacity: 24, w: 4, h: 2, satisfies: { fun: 1.0 }, star: 3, themepark: true, info: "High-speed tubular steel coaster station. Unlocks Loop-de-Loops, Corkscrews and Launch Boosts!" },
    { id: "coaster_hyper", name: "Mythical Hyper Coaster Station", emoji: "🐉", cost: 9500, upkeep: 115, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "hyper", thrill: 5, price: 18, capacity: 24, w: 4, h: 2, satisfies: { fun: 1.0 }, star: 4, fantasy: true, themepark: true, info: "Enchanted sky-high dragon coaster supporting every special element, extreme heights and blistering speed." },
    { id: "ferris_wheel", name: "Giant Ferris Wheel", emoji: "🎡", cost: 6800, upkeep: 85, type: "ride", rideKind: "wheel", thrill: 2, price: 9, capacity: 18, w: 2, h: 2, satisfies: { fun: 0.88, energy: 0.1 }, star: 2, themepark: true, info: "Revolving observation wheel giving guests sweeping views over the zoo and theme park." },
    { id: "rubber_duck_stand", name: "Hook-a-Duck Stall", emoji: "🦆", cost: 900, upkeep: 14, type: "arcade", price: 5, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.45 }, star: 0, themepark: true, info: "Classic fairground rubber-ducking water trough where guests hook floating yellow ducks for prizes." },
    { id: "air_rifle_stand", name: "Air Rifle Shooting Gallery", emoji: "🎯", cost: 1300, upkeep: 18, type: "arcade", price: 6, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.55 }, star: 1, themepark: true, info: "Cork & tin-can air-rifling gallery with moving mechanical targets and bullseyes." },
    { id: "ring_toss_stand", name: "Ring Toss Stall", emoji: "⭕", cost: 850, upkeep: 12, type: "arcade", price: 4, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.4 }, star: 0, themepark: true, info: "Carnival bottle ring-toss booth stacked with giant plush prizes." },
    { id: "whack_a_mole", name: "Whack-a-Critter Arcade", emoji: "🔨", cost: 1100, upkeep: 16, type: "arcade", price: 5, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.5 }, star: 1, themepark: true, info: "Rowdy mallet arcade cabinet where pop-up critters test guests' reflexes." },
    { id: "high_striker", name: "Strongman High Striker", emoji: "🔔", cost: 950, upkeep: 12, type: "arcade", price: 5, capacity: 3, w: 1, h: 1, satisfies: { fun: 0.48 }, star: 0, themepark: true, info: "Towering carnival bell-ringer where guests swing a heavy mallet to ring the top gong." },
    { id: "candy_floss", name: "Candy Floss Stand", emoji: "🍭", cost: 750, upkeep: 12, type: "food", price: 5, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.22, fun: 0.25 }, star: 0, themepark: true, info: "Spins clouds of pink and blue spun sugar on a stick." },
    { id: "popcorn_stand", name: "Popcorn Kiosk", emoji: "🍿", cost: 800, upkeep: 14, type: "food", price: 5, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.25, fun: 0.18 }, star: 0, themepark: true, info: "Buttery kettle-popped corn in classic red-and-white striped tubs." },
    { id: "hot_dog_stand", name: "Hot Dog Cart", emoji: "🌭", cost: 1100, upkeep: 18, type: "food", price: 6, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.48, fun: 0.1 }, star: 0, themepark: true, info: "Sizzling fairground frankfurters topped with mustard and ketchup." },
    { id: "slushie_bar", name: "Slushie & Soda Bar", emoji: "🧊", cost: 850, upkeep: 14, type: "drink", price: 4, capacity: 4, w: 1, h: 1, satisfies: { thirst: 0.65, fun: 0.15 }, star: 1, themepark: true, info: "Brain-freezing neon cherry and blue-raspberry ice slushies." }
  ],

  staff: [
    { id: "keeper", name: "Keeper", emoji: "🧑‍🌾", "wage/day": 60, hireCost: 150, effect: "Feeds animals, cleans enclosures & repairs fences across reachable paths (responds immediately by radio)" },
    { id: "vet", name: "Vet", emoji: "🩺", "wage/day": 120, hireCost: 800, effect: "Treats sick & injured animals across reachable paths (responds immediately by radio)" },
    { id: "cleaner", name: "Cleaner", emoji: "🧹", "wage/day": 50, hireCost: 100, effect: "Sweeps paths and empties bins" },
    { id: "guide", name: "Guide", emoji: "🧭", "wage/day": 55, hireCost: 150, effect: "Boosts guest happiness" },
    { id: "security", name: "Security guard", emoji: "🛡️", "wage/day": 70, hireCost: 200, effect: "Recaptures escaped animals" },
    { id: "mechanic", name: "Mechanic", emoji: "🔧", "wage/day": 85, hireCost: 300, effect: "Inspects & repairs rollercoasters across reachable paths (responds immediately by radio on breakdowns)" }
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
    { id: "money_100000", text: "Have £100,000 in the bank", type: "money", target: 100000, reward: 8000 },
    { id: "themepark_3", text: "Build 3 theme park rides or arcade stalls", type: "themepark", target: 3, reward: 1800 }
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
    enclosureCrowded: [
      "Those animals look crowded in there.",
      "I hope they have enough room to roam.",
      "That enclosure seems too full."
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
    ],
    flyingMonkey: [
      "Watch out — winged monkeys overhead!",
      "A flying monkey swooped right past my hat!",
      "Eek! Flying monkeys from the exhibit!"
    ],
    coaster: [
      "Hands up on the rollercoaster!",
      "That drop on the coaster was wicked!",
      "My heart is still racing from that ride!",
      "Best rollercoaster in any zoo!"
    ],
    arcade: [
      "I hooked a rubber duck and won a prize!",
      "Bullseye at the air rifle gallery!",
      "The carnival games here are brilliant!",
      "Nearly rang the bell on the high striker!"
    ],
    candyFloss: [
      "Ooh, pink candy floss!",
      "Nothing beats fairground popcorn and candy floss.",
      "Sticky fingers, happy days!"
    ],
    coasterCustom: [
      "What a brilliant custom rollercoaster!",
      "I loved flying over the zoo on that track!",
      "That drop took my breath away!",
      "Let's queue up and ride that coaster again!"
    ],
    coasterLoop: [
      "WHOA! We went completely upside down on that loop!",
      "That loop-de-loop was unreal!",
      "My stomach is still in the corkscrew!"
    ],
    coasterSplash: [
      "Haha, soaked on the splashdown!",
      "What a refreshing water splash!"
    ],
    coasterOverlook: [
      "You can see the animals right from the coaster track!",
      "Flying above the enclosures is amazing!"
    ],
    coasterStuck: [
      "Uh oh, the coaster train has stopped on the track!",
      "Hope a mechanic gets us moving again soon!"
    ]
  },

  coaster: {
    clearance: 1.8,
    stationDeck: 1.8,
    elevStep: 1.6,
    maxSlope: 1.8,
    maxSpan: 5,
    prefSpan: 3,
    refund: 0.5,
    refundTrain: 0.6,
    carLen: 2.1,
    carGap: 0.22,
    dwell: 6,
    fareMax: 35,
    viewRadius: 4,
    breakdownPerHour: 0.006,
    fixTime: 65,
    engineerTime: 4.5,
    engineerFee: 180,
    callOutFee: 60,
    types: {
      wooden: {
        id: "wooden", name: "Wooden Coaster", stationId: "coaster_wooden", star: 0,
        trackCost: 35, waterExtra: 35, trainCost: 2400, carCost: 500, trainUpkeep: 28, carUpkeep: 6,
        minCars: 2, maxCars: 5, maxTrains: 3, capacity: 4, maxHeight: 5,
        baseSpeed: 8.5, maxSpeed: 15.5, excMul: 1.0,
        allowedSpecs: [1, 3],
        colors: { rail: 0x8b5a2b, tie: 0x6d421e, support: 0x9b6b3c, car: 0xc93b3b, accent: 0xf4e4c1, station: 0x8b5a2b, roof: 0xb84232 }
      },
      mine: {
        id: "mine", name: "Runaway Mine Train", stationId: "coaster_mine", star: 1,
        trackCost: 42, waterExtra: 40, trainCost: 3000, carCost: 650, trainUpkeep: 34, carUpkeep: 7,
        minCars: 2, maxCars: 5, maxTrains: 3, capacity: 4, maxHeight: 7,
        baseSpeed: 9.2, maxSpeed: 17.0, excMul: 1.1,
        allowedSpecs: [1, 2, 3],
        colors: { rail: 0x5c534a, tie: 0x6b4423, support: 0x7a5230, car: 0x9c5a2c, accent: 0xe6b44c, station: 0x735238, roof: 0x585c62 }
      },
      flume: {
        id: "flume", name: "Splash Log Flume", stationId: "coaster_flume", star: 2,
        trackCost: 48, waterExtra: 20, trainCost: 3200, carCost: 700, trainUpkeep: 38, carUpkeep: 8,
        minCars: 2, maxCars: 4, maxTrains: 3, capacity: 4, maxHeight: 8,
        baseSpeed: 8.0, maxSpeed: 16.0, excMul: 1.15,
        allowedSpecs: [1, 3],
        colors: { rail: 0x3b8ec4, tie: 0x2a6d9c, support: 0x7e5a38, car: 0x7a4822, accent: 0x9be2ff, station: 0x4b7b9e, roof: 0x3b6e52 }
      },
      steel: {
        id: "steel", name: "Steel Thrill Coaster", stationId: "coaster_steel", star: 3,
        trackCost: 60, waterExtra: 50, trainCost: 4400, carCost: 900, trainUpkeep: 48, carUpkeep: 10,
        minCars: 2, maxCars: 6, maxTrains: 3, capacity: 4, maxHeight: 12,
        baseSpeed: 10.5, maxSpeed: 21.0, excMul: 1.3,
        allowedSpecs: [1, 2, 3, 4, 5, 6, 7],
        colors: { rail: 0xd93838, tie: 0x354352, support: 0xcfd6de, car: 0x2574c4, accent: 0xffd24c, station: 0x34465a, roof: 0xd93838 }
      },
      hyper: {
        id: "hyper", name: "Mythical Hyper Coaster", stationId: "coaster_hyper", star: 4, fantasy: true,
        trackCost: 80, waterExtra: 55, trainCost: 5800, carCost: 1150, trainUpkeep: 60, carUpkeep: 12,
        minCars: 2, maxCars: 6, maxTrains: 3, capacity: 4, maxHeight: 18,
        baseSpeed: 12.0, maxSpeed: 25.0, excMul: 1.5,
        allowedSpecs: [1, 2, 3, 4, 5, 6, 7],
        colors: { rail: 0x9b4dff, tie: 0x3a205c, support: 0xe6c15c, car: 0x6f2dbd, accent: 0x56f0d0, station: 0x4d267a, roof: 0xd4a438 }
      }
    },
    specials: [
      { id: 1, key: "lift", name: "Chain Lift Hill", emoji: "⛓️", cost: 60, star: 0, excitement: 0.3, intensity: 0.1, info: "Motorized chain lift that pulls coaster trains briskly up steep climbs." },
      { id: 2, key: "boost", name: "Launch Boost", emoji: "⚡", cost: 180, star: 2, excitement: 0.9, intensity: 0.7, info: "High-speed launch pads that rocket trains down straight track. Requires Mine, Steel or Hyper coaster." },
      { id: 3, key: "splash", name: "Water Splash", emoji: "💦", cost: 160, star: 2, excitement: 0.85, intensity: 0.4, info: "Splashdown water trough that sprays guests as the train zooms through. Bonus excitement on Log Flumes!" },
      { id: 4, key: "loop", name: "Loop-de-Loop", emoji: "➿", cost: 450, star: 3, excitement: 1.65, intensity: 1.4, info: "Full 360° vertical inversion loop on straight track. Requires Steel or Hyper coaster." },
      { id: 5, key: "corkscrew", name: "Corkscrew", emoji: "🌀", cost: 520, star: 3, excitement: 1.85, intensity: 1.6, info: "Twisting 360° barrel-roll inversion on straight track. Requires Steel or Hyper coaster." },
      { id: 6, key: "loop_large", name: "Large Loop-de-Loop", emoji: "🎡", cost: 850, star: 3, excitement: 2.35, intensity: 1.95, info: "Massive 360° vertical clothoid loop towering over straight track. Requires Steel or Hyper coaster." },
      { id: 7, key: "corkscrew_large", name: "Large Corkscrew", emoji: "🌪️", cost: 960, star: 3, excitement: 2.5, intensity: 2.1, info: "Sweeping grand 360° helical barrel-roll inversion along straight track. Requires Steel or Hyper coaster." }
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
    { id: "heatwave", name: "Heatwave", emoji: "☀️", weight: 2, dur: 12, text: "A heatwave sends temperatures soaring. Guests are thirstier than usual.", effect: { type: "weather", weather: "heat", hours: 12, dur: 12, amount: 20 } },
    { id: "rain", name: "Heavy rain", emoji: "🌧️", weight: 2, dur: 6, text: "Heavy rain keeps visitors indoors for the afternoon.", effect: { type: "weather", weather: "rain", hours: 6, dur: 6, amount: -15 } },
    { id: "storm_damage", name: "Storm damage", emoji: "⛈️", weight: 1.2, dur: 4, text: "A violent storm snaps branches and knocks over a fence panel.", effect: { type: "weather", weather: "storm", breach: true, hours: 4, dur: 4, amount: 1 } },
    { id: "celebrity_visit", name: "Celebrity visit", emoji: "🌟", weight: 1.5, dur: 12, text: "A television presenter visits and films a segment at the zoo.", effect: { type: "celebrity", arrivals: 1.6, reputation: 5, hours: "day", dur: 12, amount: 25 } },
    { id: "school_trip", name: "School trip", emoji: "🚌", weight: 2, text: "A school trip arrives, bringing a noisy but generous crowd.", effect: { type: "schoolTrip", guests: 32, amount: 600 } },
    { id: "donation", name: "Anonymous donation", emoji: "💌", weight: 1, text: "An anonymous donor leaves a generous envelope at the gate.", effect: { type: "donation", base: 500, perStar: 250, amount: 1000 } },
    { id: "bin_fire", name: "Bin fire", emoji: "🔥", weight: 1.2, text: "A bin catches fire behind the café, and the sprinklers soak the path.", effect: { type: "binFire", radius: 5, dirt: 150, amount: -10 } },
    { id: "vaccine", name: "Vaccination drive", emoji: "💉", weight: 1, dur: 48, text: "A new vaccine boosts animal health across the zoo.", effect: { type: "vaccine", health: 10, sick: 0.5, hours: 48, dur: 48, amount: 5 } },
    { id: "food_inspection", name: "Food-safety inspection", emoji: "📋", weight: 1.2, text: "An environmental health officer turns up unannounced to inspect your kitchens, bins and toilets.", effect: { type: "inspection", reward: 400, fine: 600 } },
    { id: "viral_video", name: "Viral video", emoji: "📱", weight: 1.2, dur: 48, text: "A video of a zoo animal doing something daft has gone viral online.", effect: { type: "viral", arrivals: 1.4, reputation: 3, hours: 48, dur: 48 } },
    { id: "conservation_grant", name: "Conservation grant", emoji: "📈", weight: 0.9, dur: 72, text: "A national wildlife fund awards your zoo an operating conservation grant.", effect: { type: "grant", mult: 1.35, hours: 72, dur: 72 } },
    { id: "feed_shortage", name: "Feed shortage", emoji: "📉", weight: 0.9, dur: 72, text: "A regional harvest shortfall increases animal feed and supplier costs temporarily.", effect: { type: "feedShortage", mult: 1.25, hours: 72, dur: 72 } },
    { id: "staff_illness", name: "Staff illness", emoji: "🤒", weight: 1, dur: 24, text: "A stomach bug is going round the staff room.", effect: { type: "staffIllness", hours: 24, dur: 24 } },
    { id: "power_cut", name: "Power cut", emoji: "🔌", weight: 0.8, dur: 8, text: "A power cut knocks out zoo refrigeration and perimeter alarms.", effect: { type: "powerCut", hours: 8, dur: 8 } }
  ],

  weather: [
    { id: "clear", name: "Clear skies", emoji: "☀️", blurb: "Bright and pleasant.", effects: "Guests are slightly happier." },
    { id: "cloudy", name: "Overcast", emoji: "☁️", blurb: "Grey skies, but dry.", effects: "No effect." },
    { id: "rain", name: "Rain", emoji: "🌧️", blurb: "Steady rain soaks the zoo.", effects: "About 45% fewer arrivals, slower and grumpier guests who seek shelter, muddier paths, shops and food sell a little more." },
    { id: "storm", name: "Thunderstorm", emoji: "⛈️", blurb: "Thunder rolls over the enclosures.", effects: "About 75% fewer arrivals, guests flee for cover and leave, animals are stressed; wet fences & restless animals — escape risk +35%." },
    { id: "heat", name: "Heatwave", emoji: "🔥", blurb: "Scorching temperatures.", effects: "Guests are about 80% thirstier and tire 30% faster, drinks and ice cream sell well, animals without water suffer and illness is more likely." },
    { id: "fog", name: "Fog", emoji: "🌫️", blurb: "A thick mist hangs over the zoo.", effects: "About 15% fewer arrivals; animals are hard to see so guests enjoy themselves a little less." }
  ],

  difficulties: [
    { id: "easy", name: "Relaxed", blurb: "Plenty of starting cash, cheaper running costs and busier gates. Good for learning the ropes.", money: 35000, income: 1.1, costs: 0.85, arrivals: 1.1, interest: 0.002 },
    { id: "normal", name: "Standard", blurb: "A fair challenge. Careful planning turns a modest profit; careless spending sinks the zoo.", money: 22000, income: 1, costs: 1, arrivals: 1, interest: 0.004 },
    { id: "hard", name: "Tycoon", blurb: "Lean starting funds, dearer upkeep, fewer guests and costly loans. Every pound counts.", money: 15000, income: 0.92, costs: 1.2, arrivals: 0.9, interest: 0.007 }
  ]
};
