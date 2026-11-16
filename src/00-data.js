// ===== 00-data.js =====
var window = typeof window!=='undefined' ? window : globalThis;
window.Z = window.Z || {};
window.Z.DATA = {
  terrain: [
    { id: "grass", name: "Fern meadow", colour: "#6fae4a", cost: 5 },
    { id: "savannah", name: "Dry plain", colour: "#c9a85a", cost: 8 },
    { id: "dirt", name: "Mud", colour: "#8b6a45", cost: 4 },
    { id: "sand", name: "Sand", colour: "#e6d19a", cost: 12 },
    { id: "snow", name: "Polar snow", colour: "#f2f6fa", cost: 15 },
    { id: "rainforest", name: "Jungle", colour: "#2f7a3e", cost: 18 },
    { id: "forest", name: "Conifer forest", colour: "#3e6b35", cost: 15 },
    { id: "rock", name: "Rock", colour: "#8a8580", cost: 20 },
    { id: "water", name: "Water", colour: "#3a86b8", cost: 30 }
  ],

  fences: [
    { id: "low_wood", name: "Low wooden fence", cost: 15, strength: 1, height: 0.9, seeThrough: true, style: "wood" },
    { id: "post_rail", name: "Post and rail", cost: 25, strength: 1, height: 1.2, seeThrough: true, style: "rail" },
    { id: "hedge", name: "Hedge", cost: 30, strength: 1, height: 1.8, seeThrough: false, style: "hedge" },
    { id: "chainlink", name: "Chain-link fence", cost: 45, strength: 3, height: 2.0, seeThrough: true, style: "chain" },
    { id: "glass", name: "Glass panel", cost: 75, strength: 3, height: 2.2, seeThrough: true, style: "glass" },
    { id: "reinforced", name: "Reinforced mesh", cost: 120, strength: 5, height: 2.5, seeThrough: true, style: "chain" },
    { id: "concrete", name: "Concrete wall", cost: 140, strength: 5, height: 3.0, seeThrough: false, style: "concrete" }
  ],

  paths: [
    { id: "dirt_path", name: "Dirt path", cost: 5, colour: "#9c7a52", speed: 1.0 },
    { id: "paved", name: "Paved path", cost: 15, colour: "#c9c5be", speed: 1.2 },
    { id: "cobble", name: "Cobbled path", cost: 25, colour: "#8d8780", speed: 1.1 }
  ],

  animals: [
    {
      id: "dryosaurus", name: "Dryosaurus", emoji: "🦎", biome: "forest",
      terrainPrefs: { forest: 0.4, grass: 0.3, savannah: 0.2, dirt: 0.1 },
      cost: 500, "upkeep/day": 12, appeal: 14, space: 4, social: [2, 6], diet: "herbivore",
      foliage: ["fern", "horsetail", "ginkgo"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 2, speed: 1.6, size: 0.8,
      lifespan: 900, breedChance: 0.15, star: 0, danger: 0,
      site: "morrison", rarity: 1, period: "Late Jurassic", length: 3.0, predator: false,
      fact: "Dryosaurus was a slim, fast plant-eater, and its long legs suggest it could outrun many predators."
    },
    {
      id: "compsognathus", name: "Compsognathus", emoji: "🦖", biome: "rock",
      terrainPrefs: { rock: 0.5, sand: 0.3, dirt: 0.2 },
      cost: 400, "upkeep/day": 10, appeal: 10, space: 3, social: [3, 10], diet: "carnivore",
      foliage: ["fern", "horsetail", "rock_pile"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 1, speed: 1.6, size: 0.3,
      lifespan: 600, breedChance: 0.25, star: 0, danger: 0,
      site: "european", rarity: 1, period: "Late Jurassic", length: 1.0, predator: true,
      fact: "Compsognathus was about the size of a chicken, and its best-known fossils come from the Solnhofen limestone of Bavaria."
    },
    {
      id: "leaellynasaura", name: "Leaellynasaura", emoji: "🦎", biome: "forest",
      terrainPrefs: { forest: 0.5, snow: 0.35, rock: 0.15 },
      cost: 1400, "upkeep/day": 35, appeal: 24, space: 5, social: [3, 8], diet: "herbivore",
      foliage: ["fern", "snow_pine", "horsetail"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 2, speed: 1.3, size: 0.8,
      lifespan: 1200, breedChance: 0.1, star: 0, danger: 0,
      site: "polar", rarity: 3, period: "Early Cretaceous", length: 2.2, predator: false,
      fact: "Leaellynasaura had unusually large areas of brain linked to vision, which may have helped it see through polar winter darkness."
    },
    {
      id: "protoceratops", name: "Protoceratops", emoji: "🦴", biome: "sand",
      terrainPrefs: { sand: 0.5, savannah: 0.3, rock: 0.2 },
      cost: 1800, "upkeep/day": 45, appeal: 20, space: 5, social: [4, 12], diet: "herbivore",
      foliage: ["cycad", "bush", "rock_pile"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 2, speed: 1.2, size: 0.9,
      lifespan: 1200, breedChance: 0.12, star: 0, danger: 0,
      site: "gobi", rarity: 2, period: "Late Cretaceous", length: 1.8, predator: false,
      fact: "Protoceratops laid its eggs in nests in sand, and a famous fossil shows one locked in combat with a velociraptor."
    },
    {
      id: "gallimimus", name: "Gallimimus", emoji: "🦖", biome: "savannah",
      terrainPrefs: { savannah: 0.5, sand: 0.3, grass: 0.2 },
      cost: 2800, "upkeep/day": 70, appeal: 34, space: 8, social: [3, 10], diet: "omnivore",
      foliage: ["horsetail", "cycad", "bush"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 3, speed: 1.8, size: 1.6,
      lifespan: 1200, breedChance: 0.1, star: 0, danger: 0,
      site: "gobi", rarity: 2, period: "Late Cretaceous", length: 5.0, predator: false,
      fact: "Gallimimus means chicken mimic, and its toothless beak and long legs made it a fast, omnivorous runner."
    },
    {
      id: "pachycephalosaurus", name: "Pachycephalosaurus", emoji: "🦴", biome: "forest",
      terrainPrefs: { forest: 0.5, savannah: 0.3, rock: 0.2 },
      cost: 3000, "upkeep/day": 75, appeal: 26, space: 10, social: [2, 6], diet: "herbivore",
      foliage: ["tree_fern", "ginkgo", "fern"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 0.9, size: 1.5,
      lifespan: 1500, breedChance: 0.08, star: 0, danger: 1,
      site: "laramidia", rarity: 2, period: "Late Cretaceous", length: 4.5, predator: false,
      fact: "Pachycephalosaurus carried a dome of solid bone on its skull, up to about 25 cm thick, that may have been used in head-to-head displays."
    },
    {
      id: "parasaurolophus", name: "Parasaurolophus", emoji: "🦎", biome: "grass",
      terrainPrefs: { grass: 0.4, forest: 0.3, water: 0.2, dirt: 0.1 },
      cost: 5500, "upkeep/day": 135, appeal: 36, space: 14, social: [6, 20], diet: "herbivore",
      foliage: ["tree_fern", "reed_clump", "horsetail"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 1.0, size: 2.5,
      lifespan: 1800, breedChance: 0.08, star: 0, danger: 0,
      site: "laramidia", rarity: 2, period: "Late Cretaceous", length: 9.5, predator: false,
      fact: "Parasaurolophus had a long hollow crest that may have been used to make low, booming calls to keep the herd in touch."
    },
    {
      id: "stegosaurus", name: "Stegosaurus", emoji: "🦴", biome: "savannah",
      terrainPrefs: { savannah: 0.4, forest: 0.3, dirt: 0.2, water: 0.1 },
      cost: 5500, "upkeep/day": 135, appeal: 46, space: 12, social: [2, 5], diet: "herbivore",
      foliage: ["cycad", "ginkgo", "horsetail", "fern"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 0.8, size: 2.0,
      lifespan: 1800, breedChance: 0.06, star: 0, danger: 1,
      site: "morrison", rarity: 2, period: "Late Jurassic", length: 9.0, predator: false,
      fact: "Stegosaurus had a brain roughly the size of a walnut, and its back plates may have helped regulate its body temperature."
    },
    {
      id: "triceratops", name: "Triceratops", emoji: "🦴", biome: "grass",
      terrainPrefs: { grass: 0.4, savannah: 0.3, forest: 0.2, water: 0.1 },
      cost: 6500, "upkeep/day": 160, appeal: 52, space: 14, social: [4, 12], diet: "herbivore",
      foliage: ["bush", "fern", "reed_clump", "horsetail"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 1.0, size: 2.4,
      lifespan: 1800, breedChance: 0.06, star: 0, danger: 2,
      site: "laramidia", rarity: 3, period: "Late Cretaceous", length: 8.5, predator: false,
      fact: "Triceratops had one of the largest skulls of any land animal, with three horns and a bony frill that was probably for display."
    },
    {
      id: "ankylosaurus", name: "Ankylosaurus", emoji: "🦴", biome: "rock",
      terrainPrefs: { rock: 0.35, forest: 0.25, grass: 0.2, dirt: 0.2 },
      cost: 5200, "upkeep/day": 130, appeal: 38, space: 10, social: [1, 4], diet: "herbivore",
      foliage: ["fern", "cycad", "boulder", "rock_pile"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 4, speed: 0.8, size: 1.6,
      lifespan: 1800, breedChance: 0.05, star: 0, danger: 2,
      site: "laramidia", rarity: 2, period: "Late Cretaceous", length: 6.5, predator: false,
      fact: "Ankylosaurus had armour plates across its back and a heavy bony club on its tail, which it may have swung at attackers."
    },
    {
      id: "therizinosaurus", name: "Therizinosaurus", emoji: "🦖", biome: "savannah",
      terrainPrefs: { savannah: 0.4, sand: 0.2, dirt: 0.2, forest: 0.2 },
      cost: 7500, "upkeep/day": 185, appeal: 40, space: 16, social: [1, 3], diet: "herbivore",
      foliage: ["cycad", "horsetail", "bush"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 4, speed: 1.1, size: 3.2,
      lifespan: 1800, breedChance: 0.04, star: 0, danger: 1,
      site: "gobi", rarity: 3, period: "Late Cretaceous", length: 9.5, predator: false,
      fact: "Therizinosaurus had claws close to a metre long, yet it was a plant-eater that stripped leaves with a toothless beak."
    },
    {
      id: "diplodocus", name: "Diplodocus", emoji: "🦕", biome: "savannah",
      terrainPrefs: { savannah: 0.4, forest: 0.3, water: 0.2, dirt: 0.1 },
      cost: 7000, "upkeep/day": 175, appeal: 48, space: 30, social: [4, 12], diet: "herbivore",
      foliage: ["monkey_puzzle", "ginkgo", "cycad"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 0.7, size: 3.5,
      lifespan: 3000, breedChance: 0.03, star: 0, danger: 0,
      site: "morrison", rarity: 2, period: "Late Jurassic", length: 26, predator: false,
      fact: "Diplodocus was one of the longest land animals, and its whip-like tail may have been able to make cracking sounds."
    },
    {
      id: "brachiosaurus", name: "Brachiosaurus", emoji: "🦕", biome: "forest",
      terrainPrefs: { forest: 0.5, water: 0.3, rainforest: 0.2 },
      cost: 8000, "upkeep/day": 200, appeal: 60, space: 40, social: [3, 10], diet: "herbivore",
      foliage: ["monkey_puzzle", "ginkgo", "jungle_tree", "tree_fern"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 0.6, size: 6.0,
      lifespan: 3000, breedChance: 0.03, star: 0, danger: 1,
      site: "morrison", rarity: 4, period: "Late Jurassic", length: 22, predator: false,
      fact: "Brachiosaurus had front legs longer than its back legs, which let it hold its head high to browse in the treetops."
    },
    {
      id: "velociraptor", name: "Velociraptor", emoji: "🦖", biome: "savannah",
      terrainPrefs: { savannah: 0.5, sand: 0.3, rock: 0.2 },
      cost: 4200, "upkeep/day": 105, appeal: 46, space: 6, social: [3, 6], diet: "carnivore",
      foliage: ["bush", "rock_pile", "boulder"],
      needsWater: false, needsShelter: true, needsRocks: false, minFence: 4, speed: 1.7, size: 0.5,
      lifespan: 900, breedChance: 0.1, star: 0, danger: 2,
      site: "gobi", rarity: 3, period: "Late Cretaceous", length: 2.0, predator: true,
      fact: "Velociraptor was roughly the size of a turkey, and its arm bones have quill knobs showing that feathers anchored there."
    },
    {
      id: "dilophosaurus", name: "Dilophosaurus", emoji: "🦖", biome: "dirt",
      terrainPrefs: { dirt: 0.4, savannah: 0.3, water: 0.2, forest: 0.1 },
      cost: 9000, "upkeep/day": 225, appeal: 30, space: 14, social: [2, 4], diet: "carnivore",
      foliage: ["horsetail", "cycad", "dead_tree"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.4, size: 1.5,
      lifespan: 1200, breedChance: 0.06, star: 0, danger: 2,
      site: "morrison", rarity: 2, period: "Early Jurassic", length: 6.5, predator: true,
      fact: "Dilophosaurus had two low crests on its head, which were probably used for display rather than for fighting."
    },
    {
      id: "cryolophosaurus", name: "Cryolophosaurus", emoji: "🦖", biome: "snow",
      terrainPrefs: { snow: 0.45, forest: 0.35, water: 0.1, rock: 0.1 },
      cost: 9500, "upkeep/day": 240, appeal: 28, space: 16, social: [1, 2], diet: "carnivore",
      foliage: ["snow_pine", "ice_floe", "fern"],
      needsWater: true, needsShelter: true, needsRocks: true, minFence: 5, speed: 1.2, size: 1.8,
      lifespan: 1200, breedChance: 0.05, star: 0, danger: 2,
      site: "polar", rarity: 3, period: "Early Jurassic", length: 6.5, predator: true,
      fact: "Cryolophosaurus had a crest running across its skull, which earned it the nickname Elvisaurus."
    },
    {
      id: "baryonyx", name: "Baryonyx", emoji: "🦖", biome: "water",
      terrainPrefs: { water: 0.4, dirt: 0.3, rainforest: 0.2, forest: 0.1 },
      cost: 9800, "upkeep/day": 245, appeal: 36, space: 20, social: [1, 2], diet: "piscivore",
      foliage: ["jungle_tree", "reed_clump", "fern"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.1, size: 2.2,
      lifespan: 1500, breedChance: 0.05, star: 0, danger: 2,
      site: "european", rarity: 3, period: "Early Cretaceous", length: 9.5, predator: true,
      fact: "Baryonyx had a huge claw on its thumb, and fish scales in its stomach show that it ate a lot of fish."
    },
    {
      id: "carnotaurus", name: "Carnotaurus", emoji: "🦖", biome: "savannah",
      terrainPrefs: { savannah: 0.4, sand: 0.3, rock: 0.2, dirt: 0.1 },
      cost: 11000, "upkeep/day": 275, appeal: 44, space: 20, social: [1, 2], diet: "carnivore",
      foliage: ["dead_tree", "bush", "boulder"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 5, speed: 1.4, size: 2.0,
      lifespan: 1200, breedChance: 0.05, star: 0, danger: 3,
      site: "gondwana", rarity: 3, period: "Late Cretaceous", length: 7.5, predator: true,
      fact: "Carnotaurus had horns above its eyes and remarkably short arms, unlike most large predators."
    },
    {
      id: "spinosaurus", name: "Spinosaurus", emoji: "🦖", biome: "water",
      terrainPrefs: { water: 0.45, dirt: 0.25, rainforest: 0.2, sand: 0.1 },
      cost: 14500, "upkeep/day": 360, appeal: 66, space: 30, social: [1, 2], diet: "piscivore",
      foliage: ["jungle_tree", "reed_clump", "fern"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.2, size: 3.2,
      lifespan: 1500, breedChance: 0.04, star: 0, danger: 3,
      site: "gondwana", rarity: 4, period: "Late Cretaceous", length: 15, predator: true,
      fact: "Spinosaurus had a tall sail on its back and is one of the longest known predatory dinosaurs, possibly spending much of its time in water."
    },
    {
      id: "tyrannosaurus", name: "Tyrannosaurus", emoji: "🦖", biome: "forest",
      terrainPrefs: { forest: 0.35, savannah: 0.3, dirt: 0.2, grass: 0.15 },
      cost: 16000, "upkeep/day": 400, appeal: 70, space: 30, social: [1, 2], diet: "carnivore",
      foliage: ["pine", "dead_tree", "boulder"],
      needsWater: true, needsShelter: true, needsRocks: false, minFence: 5, speed: 1.3, size: 4.0,
      lifespan: 1500, breedChance: 0.03, star: 0, danger: 3,
      site: "laramidia", rarity: 4, period: "Late Cretaceous", length: 12.3, predator: true,
      fact: "Tyrannosaurus had one of the strongest bites of any land animal, with teeth up to about 30 cm long."
    }
  ],

  scenery: [
    { id: "ginkgo", name: "Ginkgo tree", emoji: "🌳", cost: 130, kind: "tree", biome: "forest", aesthetic: 3, inEnclosure: true, terrains: ["grass", "forest", "dirt"], info: "A hardy broadleaf tree. Counts towards the foliage score of species that like it (about one per 16 tiles of enclosure) and as general tree cover; thrives on fern meadow, conifer forest and mud, at half value elsewhere." },
    { id: "pine", name: "Pine tree", emoji: "🌲", cost: 130, kind: "tree", biome: "forest", aesthetic: 3, inEnclosure: true, terrains: ["forest", "grass", "rock", "snow"], info: "A tough conifer. Counts towards the foliage score of species that like it (about one per 16 tiles) and as general tree cover; thrives on conifer forest, fern meadow, rock and snow, at half value elsewhere." },
    { id: "monkey_puzzle", name: "Monkey puzzle tree", emoji: "🌳", cost: 300, kind: "tree", biome: "forest", aesthetic: 4, inEnclosure: true, terrains: ["forest", "grass", "rock"], info: "A spiky, long-lived conifer. Counts towards the foliage score of species that like it (about one per 16 tiles) and as tree cover; thrives on conifer forest, fern meadow and rock, at half value elsewhere." },
    { id: "cycad", name: "Cycad", emoji: "🌴", cost: 90, kind: "bush", biome: "savannah", aesthetic: 3, inEnclosure: true, terrains: ["savannah", "sand", "dirt"], info: "A drought-tolerant palm-like plant. Counts towards the foliage score of species that like it (about one per 16 tiles) and as cover; thrives on dry plain, sand and mud, at half value elsewhere." },
    { id: "horsetail", name: "Horsetail", emoji: "🌿", cost: 40, kind: "bush", biome: "any", aesthetic: 2, inEnclosure: true, terrains: ["grass", "dirt"], info: "A soft, damp-loving plant that many herbivores graze. Counts towards the foliage score of species that like it (about one per 16 tiles); thrives on fern meadow and mud, at half value elsewhere." },
    { id: "tree_fern", name: "Tree fern", emoji: "🌴", cost: 220, kind: "tree", biome: "rainforest", aesthetic: 4, inEnclosure: true, terrains: ["rainforest", "grass", "dirt"], info: "A towering fern of humid forests. Counts towards the foliage score of species that like it (about one per 16 tiles) and as tree cover; thrives on jungle, fern meadow and mud, at half value elsewhere." },
    { id: "dead_tree", name: "Dead tree", emoji: "🌳", cost: 60, kind: "tree", biome: "savannah", aesthetic: 2, inEnclosure: true, terrains: ["savannah", "sand", "dirt", "rock"], info: "A bare, sun-bleached trunk. Counts towards the foliage score of species that like it (about one per 16 tiles) and as tree cover; stands happily on dry plain, sand, mud and rock, at half value elsewhere." },
    { id: "snow_pine", name: "Snow pine", emoji: "🌲", cost: 130, kind: "tree", biome: "snow", aesthetic: 3, inEnclosure: true, terrains: ["snow", "rock", "forest"], info: "A frost-hardy conifer. Counts towards the foliage score of species that like it (about one per 16 tiles) and as tree cover; thrives on polar snow, rock and conifer forest, at half value elsewhere." },
    { id: "jungle_tree", name: "Jungle tree", emoji: "🌴", cost: 220, kind: "tree", biome: "rainforest", aesthetic: 4, inEnclosure: true, terrains: ["rainforest", "grass", "dirt"], info: "A broad canopy tree. Counts towards the foliage score of species that like it (about one per 16 tiles) and as tree cover; thrives on jungle, fern meadow and mud, at half value elsewhere." },
    { id: "bush", name: "Shrub", emoji: "🌿", cost: 25, kind: "bush", biome: "any", aesthetic: 2, inEnclosure: true, terrains: ["grass", "savannah", "forest", "dirt", "rainforest"], info: "A cheap, hardy shrub. Counts towards the foliage score of species that like it (about one per 16 tiles) and as general cover; thrives on most ground except sand, snow and rock, at half value elsewhere." },
    { id: "fern", name: "Fern", emoji: "🌿", cost: 20, kind: "bush", biome: "rainforest", aesthetic: 2, inEnclosure: true, terrains: ["rainforest", "grass", "forest", "dirt"], info: "A low, shade-loving plant that herbivores love to browse. Counts towards the foliage score of species that like it (about one per 16 tiles); thrives on jungle, fern meadow, conifer forest and mud, at half value elsewhere." },
    { id: "reed_clump", name: "Reed clump", emoji: "🎋", cost: 30, kind: "bush", biome: "water", aesthetic: 2, inEnclosure: true, terrains: ["water", "dirt", "grass"], waterEdge: true, info: "Tall reeds for the water margin. Count towards the foliage score of species that like them (about one per 16 tiles); they thrive on mud or fern meadow right beside water and only half as well further from it." },
    { id: "boulder", name: "Boulder", emoji: "🪨", cost: 80, kind: "rock", biome: "rock", aesthetic: 2, inEnclosure: true, info: "A large rock. Counts as a rock for species that need rocks (one per 24 tiles of enclosure) and towards the foliage score of species that like it." },
    { id: "rock_pile", name: "Rock pile", emoji: "🪨", cost: 50, kind: "rock", biome: "rock", aesthetic: 2, inEnclosure: true, info: "A small cairn. Counts as a rock for species that need rocks (one per 24 tiles of enclosure) and towards the foliage score of species that like it." },
    { id: "ice_floe", name: "Ice floe", emoji: "🧊", cost: 90, kind: "rock", biome: "snow", aesthetic: 2, inEnclosure: true, info: "A slab of ice that can float on water. Counts as a rock for species that need rocks (one per 24 tiles) and towards the foliage score of cold-loving species." },
    { id: "log", name: "Fallen log", emoji: "🪵", cost: 40, kind: "deco", biome: "forest", aesthetic: 2, inEnclosure: true, info: "A fallen log. Pure decoration inside an enclosure: it adds to the park's appearance but has no effect on habitat suitability." },
    { id: "cave_shelter", name: "Cave shelter", emoji: "🕳️", cost: 400, kind: "shelter", biome: "rock", aesthetic: 3, inEnclosure: true, info: "A natural cave. Counts as a shelter for species that need shelter (one per 30 tiles of enclosure), and lets animals sleep out of sight." },
    { id: "wooden_shelter", name: "Wooden shelter", emoji: "🛖", cost: 250, kind: "shelter", biome: "any", aesthetic: 2, inEnclosure: true, info: "A simple wooden shelter. Counts as a shelter for species that need shelter (one per 30 tiles of enclosure), and lets animals sleep out of sight." },
    { id: "heat_rock", name: "Heat rock", emoji: "☀️", cost: 180, kind: "rock", biome: "any", aesthetic: 2, inEnclosure: true, info: "A warm, sun-baked slab. Counts as a rock for species that need rocks (one per 24 tiles of enclosure)." },
    { id: "scratching_post", name: "Scratching post", emoji: "🐾", cost: 150, kind: "toy", biome: "any", aesthetic: 2, inEnclosure: true, info: "Enrichment toy. Animals walk over to use it; one toy per 40 tiles of enclosure keeps every species happier (enrichment is part of suitability)." },
    { id: "mud_wallow", name: "Mud wallow", emoji: "💧", cost: 200, kind: "toy", biome: "dirt", aesthetic: 2, inEnclosure: true, info: "Enrichment toy. Animals walk over to wallow in it; one toy per 40 tiles of enclosure keeps every species happier (enrichment is part of suitability)." },
    { id: "carcass_feeder", name: "Carcass feeder", emoji: "🥩", cost: 350, kind: "toy", biome: "any", aesthetic: 1, inEnclosure: true, info: "Meat dispenser. Predators in the enclosure need at least one, or their suitability suffers; herbivores ignore it." },
    { id: "bench", name: "Bench", emoji: "🪑", cost: 150, kind: "deco", biome: "any", aesthetic: 2, inEnclosure: false },
    { id: "lamp", name: "Lamp post", emoji: "💡", cost: 90, kind: "deco", biome: "any", aesthetic: 2, inEnclosure: false },
    { id: "flower_bed", name: "Flower bed", emoji: "🌷", cost: 60, kind: "deco", biome: "grass", aesthetic: 3, inEnclosure: false },
    { id: "fountain", name: "Fountain", emoji: "⛲", cost: 800, kind: "deco", biome: "any", aesthetic: 5, inEnclosure: false },
    { id: "bin", name: "Litter bin", emoji: "🗑️", cost: 40, kind: "deco", biome: "any", aesthetic: 0, inEnclosure: false },
    { id: "fossil_skeleton", name: "Fossil skeleton", emoji: "🦴", cost: 900, kind: "deco", biome: "any", aesthetic: 5, inEnclosure: false },
    { id: "picnic_table", name: "Picnic table", emoji: "🧺", cost: 110, kind: "deco", biome: "grass", aesthetic: 2, inEnclosure: false },
    { id: "sign", name: "Information sign", emoji: "🪧", cost: 45, kind: "deco", biome: "any", aesthetic: 1, inEnclosure: false }
  ],

  // Starting maps. bounds = playable tiles (inclusive); everything outside is "Outside your land".
  // gen = procedural parameters read by genMap() in 20f: hills {amp (levels), scale (tiles)}, ridge {j, wave, h, ramps[]}, canyon {j, wave, w, depth},
  // mesas {n, r, h}, lakes {n, r:[min,max], depth}, paint [{t, n (noise 0..1 threshold), s (noise scale), hi/lo (height limits)}], scatter [[scenery id, count, [terrain ids], {nearWater}]]
  maps: [
    { id: "fern_meadow", name: "Fern Meadow", size: "Medium", bounds: { i0: 4, j0: 8, i1: 51, j1: 55 },
      blurb: "The classic start: 48 by 48 tiles of gentle green meadow with a few low rises, a pond and plenty of room to grow.",
      gen: { base: "grass", hills: { amp: 2, scale: 14 }, lakes: { n: 1, r: [3, 4], depth: 2 },
        paint: [{ t: "dirt", n: 0.7, s: 6 }, { t: "forest", n: 0.66, s: 10 }],
        scatter: [["ginkgo", 8, ["grass", "forest"]], ["pine", 8, ["forest", "grass"]], ["bush", 10, ["grass", "forest"]], ["fern", 8, ["grass", "forest"]], ["horsetail", 6, ["grass", "dirt"]], ["boulder", 4, ["grass"]], ["reed_clump", 4, ["dirt", "grass"], { nearWater: true }]] } },
    { id: "pocket_paddock", name: "Pocket Paddock", size: "Small", bounds: { i0: 13, j0: 26, i1: 42, j1: 55 },
      blurb: "A cramped 30 by 30 plot of flat, cheap land. Every tile counts, so plan your enclosures carefully.",
      gen: { base: "grass", hills: { amp: 0, scale: 10 },
        paint: [{ t: "dirt", n: 0.78, s: 5 }],
        scatter: [["ginkgo", 3, ["grass"]], ["bush", 5, ["grass"]], ["fern", 3, ["grass"]], ["boulder", 2, ["grass"]]] } },
    { id: "lakeland", name: "Lakeland", size: "Large", bounds: { i0: 0, j0: 6, i1: 55, j1: 55 },
      blurb: "A sprawling 56 by 50 floodplain dotted with lakes and reed beds. Perfect for swimmers and water-lovers, awkward for roads.",
      gen: { base: "grass", hills: { amp: 1.5, scale: 12 }, lakes: { n: 6, r: [4, 7], depth: 2 },
        paint: [{ t: "rainforest", n: 0.68, s: 9 }, { t: "dirt", n: 0.74, s: 6 }, { t: "forest", n: 0.7, s: 12 }],
        scatter: [["reed_clump", 20, ["dirt", "grass"], { nearWater: true }], ["horsetail", 14, ["grass", "dirt"]], ["tree_fern", 8, ["rainforest", "grass"]], ["jungle_tree", 6, ["rainforest"]], ["ginkgo", 8, ["grass", "forest"]], ["pine", 6, ["forest"]], ["fern", 10, ["rainforest", "grass"]], ["bush", 8, ["grass"]]] } },
    { id: "highland_ridge", name: "Highland Ridge", size: "Large", bounds: { i0: 2, j0: 2, i1: 53, j1: 55 },
      blurb: "Rolling uplands, a long cliff line to the north and stony slopes under conifer forest. Dramatic, rugged and cheap to fill with rocks.",
      gen: { base: "grass", hills: { amp: 4, scale: 11 }, ridge: { j: 22, wave: 4, h: 6, ramps: [14, 41] },
        paint: [{ t: "rock", hi: 4 }, { t: "forest", n: 0.52, s: 9 }, { t: "rock", n: 0.82, s: 5 }],
        scatter: [["pine", 24, ["forest", "grass", "rock"]], ["monkey_puzzle", 6, ["forest", "grass"]], ["snow_pine", 4, ["rock"]], ["boulder", 14, ["rock", "grass", "forest"]], ["rock_pile", 12, ["rock", "grass"]], ["bush", 10, ["grass", "forest"]], ["fern", 6, ["forest"]], ["log", 5, ["forest"]]] } },
    { id: "dry_gulch", name: "Dry Gulch", size: "Medium", bounds: { i0: 6, j0: 6, i1: 49, j1: 55 },
      blurb: "Sun-baked savannah and sand, split by a deep canyon and studded with flat-topped mesas. Cycads thrive; ferns do not.",
      gen: { base: "savannah", hills: { amp: 1.5, scale: 13 }, canyon: { j: 25, wave: 4, w: 3, depth: 4, ramps: [14, 38] }, mesas: { n: 4, r: 4.5, h: 4 },
        paint: [{ t: "sand", n: 0.64, s: 8 }, { t: "dirt", lo: -2 }, { t: "rock", hi: 3 }],
        scatter: [["cycad", 16, ["savannah", "sand", "dirt"]], ["dead_tree", 10, ["savannah", "sand", "rock"]], ["bush", 8, ["savannah"]], ["boulder", 10, ["rock", "savannah", "sand"]], ["rock_pile", 8, ["rock", "savannah", "sand"]], ["horsetail", 3, ["dirt"]]] } },
    { id: "frostfield", name: "Frostfield", size: "Medium", bounds: { i0: 5, j0: 8, i1: 50, j1: 55 },
      blurb: "A frozen plateau of snowdrifts and dark conifer stands, with icy tarns and a few snowy knolls.",
      gen: { base: "snow", hills: { amp: 3, scale: 12 }, lakes: { n: 3, r: [3, 5], depth: 2 },
        paint: [{ t: "forest", n: 0.58, s: 8 }, { t: "rock", hi: 4 }],
        scatter: [["snow_pine", 26, ["snow", "forest", "rock"]], ["pine", 8, ["forest"]], ["ice_floe", 6, ["water"]], ["boulder", 8, ["snow", "rock"]], ["rock_pile", 6, ["snow", "rock"]], ["fern", 4, ["forest"]], ["bush", 4, ["forest"]]] } }
  ],

  buildings: [
    { id: "burger_stand", name: "Burger stand", emoji: "🍔", cost: 1200, upkeep: 20, type: "food", price: 6, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.5 }, star: 0 },
    { id: "pizza_hut", name: "Pizza kiosk", emoji: "🍕", cost: 1800, upkeep: 30, type: "food", price: 8, capacity: 6, w: 2, h: 1, satisfies: { hunger: 0.6 }, star: 0 },
    { id: "ice_cream", name: "Ice cream kiosk", emoji: "🍦", cost: 600, upkeep: 12, type: "food", price: 4, capacity: 3, w: 1, h: 1, satisfies: { hunger: 0.2, fun: 0.1 }, star: 0 },
    { id: "drinks_stall", name: "Drinks stall", emoji: "🥤", cost: 500, upkeep: 8, type: "drink", price: 3, capacity: 4, w: 1, h: 1, satisfies: { thirst: 0.6 }, star: 0 },
    { id: "coffee_cart", name: "Coffee cart", emoji: "☕", cost: 700, upkeep: 10, type: "drink", price: 4, capacity: 3, w: 1, h: 1, satisfies: { thirst: 0.4, energy: 0.3 }, star: 0 },
    { id: "toilets", name: "Toilets", emoji: "🚻", cost: 600, upkeep: 10, type: "toilet", price: 0, capacity: 8, w: 2, h: 1, satisfies: { bladder: 1 }, star: 0 },
    { id: "gift_shop", name: "Gift shop", emoji: "🎁", cost: 2500, upkeep: 30, type: "shop", price: 12, capacity: 6, w: 2, h: 2, satisfies: { fun: 0.2 }, star: 1 },
    { id: "balloon_stand", name: "Balloon stand", emoji: "🎈", cost: 350, upkeep: 5, type: "shop", price: 5, capacity: 2, w: 1, h: 1, satisfies: { fun: 0.2 }, star: 0 },
    { id: "carousel", name: "Carousel", emoji: "🎠", cost: 5000, upkeep: 70, type: "ride", price: 6, capacity: 12, w: 3, h: 3, satisfies: { fun: 0.8 }, star: 1 },
    { id: "info_kiosk", name: "Info kiosk", emoji: "ℹ️", cost: 300, upkeep: 4, type: "info", price: 0, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.05 }, star: 0 },
    { id: "viewing_platform", name: "Viewing platform", emoji: "🔭", cost: 1800, upkeep: 15, type: "info", price: 0, capacity: 20, w: 2, h: 1, satisfies: { fun: 0.3 }, star: 0 },
    { id: "restaurant", name: "Restaurant", emoji: "🍽️", cost: 8000, upkeep: 120, type: "food", price: 14, capacity: 30, w: 4, h: 3, satisfies: { hunger: 1, thirst: 0.3, energy: 0.3 }, star: 2 },
    { id: "keeper_hut", name: "Ranger station", emoji: "🛖", cost: 1200, upkeep: 12, type: "staff", price: 0, capacity: 6, w: 2, h: 2, satisfies: {}, star: 0 },
    { id: "vet_clinic", name: "Vet clinic", emoji: "🏥", cost: 3500, upkeep: 50, type: "staff", price: 0, capacity: 4, w: 3, h: 2, satisfies: {}, star: 1 },
    { id: "education_centre", name: "Discovery museum", emoji: "🎓", cost: 9000, upkeep: 90, type: "info", price: 5, capacity: 40, w: 4, h: 3, satisfies: { fun: 0.5 }, star: 2 },
    { id: "emergency_bunker", name: "Emergency bunker", emoji: "🚨", cost: 3000, upkeep: 25, type: "info", price: 0, capacity: 30, w: 2, h: 2, satisfies: {}, star: 1 },
    { id: "hatchery", name: "Hatchery", emoji: "🥚", cost: 4000, upkeep: 40, type: "science", price: 0, capacity: 2, w: 3, h: 2, satisfies: {}, star: 0 },
    { id: "research_lab", name: "Research lab", emoji: "🔬", cost: 6000, upkeep: 90, type: "science", price: 0, capacity: 2, w: 4, h: 3, satisfies: {}, star: 0 }
  ],

  staff: [
    { id: "keeper", name: "Ranger", emoji: "🧑‍🌾", "wage/day": 60, hireCost: 150, effect: "Feeds dinosaurs and cleans their enclosures" },
    { id: "vet", name: "Vet", emoji: "🩺", "wage/day": 120, hireCost: 800, effect: "Treats sick dinosaurs" },
    { id: "cleaner", name: "Cleaner", emoji: "🧹", "wage/day": 50, hireCost: 100, effect: "Sweeps paths and empties bins" },
    { id: "guide", name: "Guide", emoji: "🧭", "wage/day": 55, hireCost: 150, effect: "Boosts guest happiness" },
    { id: "security", name: "Security guard", emoji: "🛡️", "wage/day": 70, hireCost: 200, effect: "Recaptures escaped dinosaurs" },
    { id: "scientist", name: "Scientist", emoji: "🔬", wage: 40, perSkill: true, hireCost: 500, effect: "Runs amber extraction experiments in research labs; daily pay is the base wage times skill" }
  ],

  equipment: [
    { id: "sequencer", name: "Genome sequencer", emoji: "🧬", levels: [{ cost: 2000, star: 0 }, { cost: 6000, star: 2 }, { cost: 14000, star: 3 }], effect: "Raises the success chance of extraction experiments" },
    { id: "centrifuge", name: "Centrifuge", emoji: "🌀", levels: [{ cost: 2000, star: 0 }, { cost: 6000, star: 2 }, { cost: 14000, star: 3 }], effect: "Makes extraction and splicing jobs finish faster" },
    { id: "clean_room", name: "Clean room", emoji: "🧼", levels: [{ cost: 2000, star: 0 }, { cost: 6000, star: 2 }, { cost: 14000, star: 3 }], effect: "Lowers the chance of lab contamination" },
    { id: "cryo_store", name: "Cryo store", emoji: "❄️", levels: [{ cost: 2000, star: 0 }, { cost: 6000, star: 2 }, { cost: 14000, star: 3 }], effect: "Salvages degraded samples after failures and enlarges the sample store" },
    { id: "incubator", name: "Incubator", emoji: "🐣", levels: [{ cost: 2000, star: 0 }, { cost: 6000, star: 2 }, { cost: 14000, star: 3 }], effect: "Raises hatching success and speeds up incubation" },
    { id: "lab_bench", name: "Lab bench", emoji: "🧪", levels: [{ cost: 2000, star: 0 }, { cost: 6000, star: 2 }, { cost: 14000, star: 3 }], effect: "Adds scientist capacity to each research lab" }
  ],

  traits: [
    { id: "docile", name: "Docile", emoji: "🕊️", cost: 6000, effect: "Easier to keep: lowers the fence strength needed and the danger rating by one" },
    { id: "vivid", name: "Vivid", emoji: "🌈", cost: 5000, effect: "Adds 25% to the appeal of the dinosaur" },
    { id: "hardy", name: "Hardy", emoji: "🛡️", cost: 7000, effect: "Tolerates poorer terrain and foliage" },
    { id: "fertile", name: "Fertile", emoji: "🌱", cost: 6500, effect: "Breeds more often" },
    { id: "robust", name: "Robust", emoji: "💪", cost: 8000, effect: "Healthier and longer-lived" }
  ],

  grades: [
    { id: 1, name: "Cloudy", priceMult: 1 },
    { id: 2, name: "Clear", priceMult: 2.2 },
    { id: 3, name: "Pristine", priceMult: 4.5 }
  ],

  sites: [
    { id: "morrison", name: "Morrison Formation", blurb: "Late Jurassic river plains of the American west, where giant sauropods and armoured grazers left their bones.", star: 0, species: ["dryosaurus", "stegosaurus", "diplodocus", "brachiosaurus", "dilophosaurus"], basePrice: 300 },
    { id: "european", name: "Solnhofen and Weald Clay", blurb: "Shallow lagoons and clay beds across Europe, from Bavarian limestone to the English Weald.", star: 0, species: ["compsognathus", "baryonyx"], basePrice: 340 },
    { id: "gobi", name: "Djadochta Formation", blurb: "Dry Late Cretaceous dunes of the Gobi, where fierce hunters and horned grazers were buried in sand.", star: 1, species: ["protoceratops", "gallimimus", "velociraptor", "therizinosaurus"], basePrice: 600 },
    { id: "polar", name: "Dinosaur Cove and Hanson Formation", blurb: "Cold, dark forests near the poles, where small dinosaurs endured months of winter night.", star: 2, species: ["leaellynasaura", "cryolophosaurus"], basePrice: 850 },
    { id: "laramidia", name: "Hell Creek Formation", blurb: "Late Cretaceous floodplains of North America, home to tyrant lizards and the last great horned herds.", star: 2, species: ["pachycephalosaurus", "parasaurolophus", "triceratops", "ankylosaurus", "tyrannosaurus"], basePrice: 940 },
    { id: "gondwana", name: "Kem Kem Beds", blurb: "River channels of the southern supercontinent, where sail-backed fish-eaters and horned hunters lived.", star: 3, species: ["carnotaurus", "spinosaurus"], basePrice: 1190 }
  ],

  goals: [
    { id: "guests_100", text: "Welcome 100 guests", type: "guests", target: 100, reward: 500 },
    { id: "first_extract", text: "Complete your first amber extraction", type: "extractions", target: 1, reward: 700 },
    { id: "animals_5", text: "Have 5 dinosaurs in your park", type: "animals", target: 5, reward: 900 },
    { id: "rating_2", text: "Reach a 2-star park rating", type: "rating", target: 2, reward: 1200 },
    { id: "hatched_1", text: "Hatch your first dinosaur in the hatchery", type: "hatched", target: 1, reward: 1500 },
    { id: "species_3", text: "Keep 3 different species", type: "species", target: 3, reward: 2000 },
    { id: "predator_1", text: "Keep a predator safely behind strong fences", type: "predators", target: 1, reward: 2500 },
    { id: "genome_100", text: "Bring one species' genome to 100%", type: "genome100", target: 1, reward: 3500 },
    { id: "traits_1", text: "Splice your first trait into a dinosaur", type: "traits", target: 1, reward: 5000 },
    { id: "rating_4", text: "Reach a 4-star park rating", type: "rating", target: 4, reward: 8000 }
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
    "Doris", "Gertie", "Pebble", "Sprocket", "Nugget", "Crumble", "Tango", "Waffles", "Dinah", "Trevor",
    "Wobble", "Snickers", "Percy", "Bertha", "Stompy", "Hector", "Tootsie", "Marigold", "Fernando", "Otis",
    "Mabel", "Spud", "Cleo", "Dexter", "Tilly", "Bunny", "Chomp", "Gilbert", "Penny", "Rocco",
    "Sybil", "Teapot", "Munch", "Ferdinand", "Bristle", "Lulu", "Gordon", "Peaches", "Scoop", "Dodo",
    "Mungo", "Pickles", "Nessie", "Rupert", "Smudge", "Trundle", "Ginny", "Hobnob", "Sprinkle", "Wendell",
    "Esme", "Brambles", "Clementine", "Dumpling", "Pudding", "Thea", "Boris", "Mitzi", "Cosmo", "Edna"
  ],

  scientistNames: [
    "Dr Ingrid Solberg", "Dr Tomasz Wisniewski", "Dr Amara Okonkwo", "Professor Hugo Lindqvist", "Dr Leila Haddad",
    "Dr Ravi Chandrasekar", "Dr Maeve Kinsella", "Dr Samuel Adeyinka", "Dr Yuki Tanaka", "Dr Freya Brennan",
    "Dr Mateo Ruiz", "Dr Harriet Pell", "Dr Kwame Asante", "Dr Elif Demir", "Dr Oscar Nilsson",
    "Dr Priyanka Rao", "Dr Thandiwe Mahlangu", "Dr Felix Aubrey", "Dr Sofia Marchetti", "Dr Declan O'Brien",
    "Dr Mei Lin Zhou", "Dr Gareth Pugh", "Dr Nadia Benali", "Dr Lars Eriksen", "Dr Rosalind Finch",
    "Dr Jamal Idris", "Dr Helena Vogt", "Dr Arthur Pendleton", "Dr Aroha Ngata", "Dr Stellan Holm"
  ],

  guestThoughts: {
    happy: [
      "This is the best day out ever!",
      "What a marvellous park.",
      "The {animal} looks so happy today.",
      "Brilliant, the kids love it here.",
      "Worth every penny."
    ],
    hungry: [
      "I could eat a horse, or a sandwich.",
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
      "That {animal} needs more room.",
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
      "Rangers are chasing the {animal}.",
      "Stay back from the fence!",
      "Is it safe here?"
    ],
    baby: [
      "Look, a baby {animal} hatched!",
      "Aww, a new {animal} hatchling!",
      "So cute, a little {animal}.",
      "The baby {animal} is adorable.",
      "Tiny {animal}, how sweet."
    ],
    greatExhibit: [
      "This exhibit is incredible.",
      "I've never seen anything like it.",
      "Now that's a proper enclosure.",
      "Simply magnificent.",
      "Best exhibit in the park."
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
    science: [
      "I read that amber can preserve insects for millions of years.",
      "Those fossils in the museum are amazing.",
      "Are the scientists close to finishing that genome?",
      "I'd happily donate to a lab like that.",
      "Better than any lesson I had at school."
    ],
    scared: [
      "Please keep that {animal} away from me!",
      "I'm not standing anywhere near the {animal}.",
      "That roar made me jump!",
      "Shouldn't it be behind thicker glass?",
      "I want to go home now."
    ],
    authentic: [
      "This {animal} looks just like the textbook pictures.",
      "They say it's a properly sequenced genome, you know.",
      "The colours look so authentic.",
      "I can't believe how lifelike the {animal} is.",
      "Proper prehistoric, this."
    ]
  },

  tips: [
    "Guests spend more when there is somewhere to sit nearby.",
    "Give each dinosaur the terrain, foliage and water it prefers.",
    "Fences strong enough for a species stop escapes, and predators need the strongest.",
    "Place toilets and drinks stalls near busy paths.",
    "Empty bins and sweep paths to keep guests happy.",
    "Hire a vet before your large herbivores arrive.",
    "Check an enclosure report to see what its dinosaurs need.",
    "Higher ticket prices earn more but can upset guests.",
    "A great exhibit attracts donations from guests.",
    "Hedges and concrete block the view; glass and chain-link let guests see in.",
    "Your star rating unlocks new dig sites and equipment tiers.",
    "Pristine amber gives scientists far better odds than cloudy lots.",
    "A scientist's skill grows with every experiment, and experienced staff succeed more often.",
    "A genome above 50 per cent lets you incubate that species in the hatchery.",
    "Rain and storms keep guests away, so build shelter, benches and indoor attractions.",
    "Heatwaves make guests thirsty: keep drinks stalls and ice cream kiosks stocked up.",
    "Storms put dinosaurs on edge and can damage fences. Strong fences and security guards pay off.",
    "Your first amber extraction is guaranteed to work, so you can start the lab straight away.",
    "Amber prices swing with the market: check back after a slump for bargains.",
    "Days are long, so running costs add up: watch the daily report in the finance tab.",
    "Staff and building upkeep are paid at midnight. Keep a cash buffer to cover them.",
    "A warning appears if your balance drops dangerously low: sell something or take a loan in time."
  ],

  // Random events. kind-specific fields are read by fireEvent() in 20d. hours = how long the effect lasts (game hours); 'day' = until midnight.
  events: [
    { id: "heatwave", name: "Heatwave", emoji: "\u2600\ufe0f", weight: 2, text: "A heatwave sends temperatures soaring.", effect: { type: "weather", weather: "heatwave" } },
    { id: "rain", name: "Heavy rain", emoji: "\ud83c\udf27\ufe0f", weight: 2, text: "Heavy rain sweeps in from the west.", effect: { type: "weather", weather: "rain" } },
    { id: "storm_damage", name: "Storm damage", emoji: "\u26c8\ufe0f", weight: 1.2, text: "A violent storm snaps branches and knocks over a fence panel.", effect: { type: "weather", weather: "storm", breach: true } },
    { id: "celebrity_visit", name: "Celebrity visit", emoji: "\ud83c\udf1f", weight: 1.5, text: "A television presenter visits and films a segment about the dinosaurs.", effect: { type: "celebrity", arrivals: 1.6, reputation: 5, hours: "day" } },
    { id: "school_trip", name: "School trip", emoji: "\ud83d\ude8c", weight: 2, text: "A school trip arrives, bringing a noisy but generous crowd.", effect: { type: "schoolTrip", guests: 32 } },
    { id: "donation", name: "Anonymous donation", emoji: "\ud83d\udc8c", weight: 1, text: "An anonymous donor leaves a generous envelope at the gate, with a note asking after the fossils.", effect: { type: "donation", base: 500, perStar: 250 } },
    { id: "bin_fire", name: "Bin fire", emoji: "\ud83d\udd25", weight: 1.2, text: "A bin catches fire near the paths, and the sprinklers soak everything nearby.", effect: { type: "binFire", radius: 5, dirt: 150 } },
    { id: "vaccine", name: "Vaccination drive", emoji: "\ud83d\udc89", weight: 1, text: "A new vaccine arrives for the park's dinosaurs.", effect: { type: "vaccine", health: 10, sick: 0.5, hours: 48 } },
    { id: "food_inspection", name: "Food-safety inspection", emoji: "\ud83d\udccb", weight: 1.2, text: "An environmental health officer turns up unannounced to inspect your kitchens, bins and toilets.", effect: { type: "inspection", reward: 400, fine: 600 } },
    { id: "viral_video", name: "Viral video", emoji: "\ud83d\udcf1", weight: 1.2, text: "A video of a dinosaur doing something daft has gone viral online.", effect: { type: "viral", arrivals: 1.4, reputation: 3, hours: 48 } },
    { id: "amber_boom", name: "Amber boom", emoji: "\ud83d\udcc8", weight: 0.9, text: "A museum buying spree has pushed up amber prices on the market.", effect: { type: "amber", mult: 1.35, hours: 72 } },
    { id: "amber_slump", name: "Amber slump", emoji: "\ud83d\udcc9", weight: 0.9, text: "A flood of new fossils has crashed amber prices. Bargains are on the market!", effect: { type: "amber", mult: 0.7, hours: 72 } },
    { id: "staff_illness", name: "Staff illness", emoji: "\ud83e\udd12", weight: 1, text: "A stomach bug is going round the staff room.", effect: { type: "staffIllness", hours: 24 } },
    { id: "power_cut", name: "Power cut", emoji: "\ud83d\udd0c", weight: 0.8, text: "A power cut knocks out the research lab.", effect: { type: "powerCut", hours: 8 } }
  ],

  // Weather. Multipliers live in 20d (WX_TABLE); the text here is what players read.
  weather: [
    { id: "clear", name: "Clear skies", emoji: "\u2600\ufe0f", blurb: "Bright and pleasant.", effects: "Guests are slightly happier." },
    { id: "cloudy", name: "Overcast", emoji: "\u2601\ufe0f", blurb: "Grey skies, but dry.", effects: "No effect." },
    { id: "rain", name: "Rain", emoji: "\ud83c\udf27\ufe0f", blurb: "Steady rain soaks the park.", effects: "About 45% fewer arrivals, slower and grumpier guests who seek shelter, muddier paths, shops and food sell a little more." },
    { id: "storm", name: "Thunderstorm", emoji: "\u26c8\ufe0f", blurb: "Thunder rolls over the enclosures.", effects: "About 75% fewer arrivals, guests flee for cover and leave, dinosaurs are stressed, fences may be damaged and escapes are far more likely." },
    { id: "heatwave", name: "Heatwave", emoji: "\ud83d\udd25", blurb: "Scorching temperatures.", effects: "Guests are about 80% thirstier and tire 30% faster, drinks and ice cream sell well, dinosaurs without water suffer and illness is more likely." },
    { id: "fog", name: "Fog", emoji: "\ud83c\udf2b\ufe0f", blurb: "A thick mist hangs over the park.", effects: "About 15% fewer arrivals; dinosaurs are hard to see so guests enjoy themselves a little less." }
  ],

  difficulties: [
    { id: "easy", name: "Relaxed", blurb: "Plenty of starting cash, cheaper running costs and busier gates. Good for learning the ropes.", money: 35000, income: 1.1, costs: 0.85, arrivals: 1.1, interest: 0.002 },
    { id: "normal", name: "Standard", blurb: "A fair challenge. Careful planning turns a modest profit; careless spending sinks the park.", money: 22000, income: 1, costs: 1, arrivals: 1, interest: 0.004 },
    { id: "hard", name: "Tycoon", blurb: "Lean starting funds, dearer upkeep, fewer guests and costly loans. Every pound counts.", money: 15000, income: 0.92, costs: 1.2, arrivals: 0.9, interest: 0.007 }
  ]
};
