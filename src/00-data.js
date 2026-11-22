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
      site: "european", rarity: 1, period: "Late Jurassic", length: 1.0, predator: true, packHunter: true,
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
      site: "gobi", rarity: 3, period: "Late Cretaceous", length: 2.0, predator: true, packHunter: true,
      fact: "Velociraptor was roughly the size of a turkey, and its arm bones have quill knobs showing that feathers anchored there."
    },
    {
      id: "dilophosaurus", name: "Dilophosaurus", emoji: "🦖", biome: "dirt",
      terrainPrefs: { dirt: 0.4, savannah: 0.3, water: 0.2, forest: 0.1 },
      cost: 9000, "upkeep/day": 225, appeal: 30, space: 14, social: [2, 4], diet: "carnivore",
      foliage: ["horsetail", "cycad", "dead_tree"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 1.4, size: 1.5,
      lifespan: 1200, breedChance: 0.06, star: 0, danger: 2,
      site: "morrison", rarity: 2, period: "Early Jurassic", length: 6.5, predator: true, packHunter: true,
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
    },
    // ---- creatures package: marine reptiles (realm "sea"), pterosaurs (realm "air") and modern wildlife (modern: true). None of the prehistoric ones are dinosaurs.
    {
      id: "ichthyosaurus", name: "Ichthyosaurus", emoji: "🐬", biome: "water", realm: "sea",
      terrainPrefs: { water: 1.0 },
      cost: 3800, "upkeep/day": 95, appeal: 32, space: 8, social: [3, 8], diet: "piscivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 2.4, size: 0.7,
      lifespan: 1000, breedChance: 0.12, star: 2, danger: 0,
      site: "european", rarity: 2, period: "Early Jurassic", length: 2.0, predator: false,
      fact: "Ichthyosaurus was a dolphin-shaped marine reptile (not a dinosaur) that gave birth to live young at sea; its fossils come from the cliffs around Lyme Regis."
    },
    {
      id: "archelon", name: "Archelon", emoji: "🐢", biome: "water", realm: "sea",
      terrainPrefs: { water: 1.0 },
      cost: 6800, "upkeep/day": 165, appeal: 44, space: 14, social: [1, 3], diet: "omnivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 2, speed: 0.9, size: 1.5,
      lifespan: 1800, breedChance: 0.05, star: 2, danger: 0,
      site: "laramidia", rarity: 3, period: "Late Cretaceous", length: 4.6, predator: false,
      fact: "Archelon was the largest sea turtle known, with a leathery rather than hard shell; it is a turtle, not a dinosaur, and swam the inland sea that once covered North America."
    },
    {
      id: "elasmosaurus", name: "Elasmosaurus", emoji: "🦕", biome: "water", realm: "sea",
      terrainPrefs: { water: 1.0 },
      cost: 9500, "upkeep/day": 235, appeal: 58, space: 20, social: [1, 3], diet: "piscivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 2, speed: 1.1, size: 3.0,
      lifespan: 1600, breedChance: 0.04, star: 3, danger: 0,
      site: "laramidia", rarity: 3, period: "Late Cretaceous", length: 10, predator: false,
      fact: "Elasmosaurus was a plesiosaur (a marine reptile, not a dinosaur) whose neck held about 72 vertebrae and made up roughly half its total length."
    },
    {
      id: "liopleurodon", name: "Liopleurodon", emoji: "🦈", biome: "water", realm: "sea",
      terrainPrefs: { water: 1.0 },
      cost: 11500, "upkeep/day": 285, appeal: 56, space: 22, social: [1, 2], diet: "carnivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 4, speed: 1.9, size: 2.4,
      lifespan: 1500, breedChance: 0.03, star: 3, danger: 3,
      site: "european", rarity: 3, period: "Late Jurassic", length: 6.4, predator: true,
      fact: "Liopleurodon was a short-necked pliosaur, a marine reptile rather than a dinosaur, with a huge skull and four powerful flippers for ambushing prey."
    },
    {
      id: "mosasaurus", name: "Mosasaurus", emoji: "🐊", biome: "water", realm: "sea",
      terrainPrefs: { water: 1.0 },
      cost: 17000, "upkeep/day": 430, appeal: 78, space: 30, social: [1, 2], diet: "carnivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 5, speed: 2.0, size: 3.6,
      lifespan: 1500, breedChance: 0.03, star: 4, danger: 3,
      site: "laramidia", rarity: 4, period: "Late Cretaceous", length: 11, predator: true,
      fact: "Mosasaurus was a giant sea-going lizard, more closely related to today's monitor lizards than to any dinosaur; it ruled the oceans of the last few million years of the Cretaceous."
    },
    {
      id: "dimorphodon", name: "Dimorphodon", emoji: "🦇", biome: "rock", realm: "air",
      terrainPrefs: { rock: 0.4, forest: 0.3, grass: 0.2, dirt: 0.1 },
      cost: 3200, "upkeep/day": 80, appeal: 28, space: 6, social: [2, 6], diet: "carnivore",
      foliage: ["pine", "rock_pile"],
      needsWater: false, needsShelter: true, needsRocks: true, minFence: 1, speed: 1.8, size: 0.4,
      lifespan: 800, breedChance: 0.15, star: 2, danger: 0,
      site: "european", rarity: 2, period: "Early Jurassic", length: 1.0, predator: true, packHunter: true,
      fact: "Dimorphodon, a small pterosaur (a flying reptile, not a dinosaur), had two different kinds of teeth, which is what its name means."
    },
    {
      id: "rhamphorhynchus", name: "Rhamphorhynchus", emoji: "🦇", biome: "water", realm: "air",
      terrainPrefs: { sand: 0.35, rock: 0.3, grass: 0.2, water: 0.15 },
      cost: 3600, "upkeep/day": 90, appeal: 30, space: 6, social: [2, 6], diet: "piscivore",
      foliage: ["reed_clump", "rock_pile"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 2.0, size: 0.4,
      lifespan: 800, breedChance: 0.15, star: 2, danger: 0,
      site: "european", rarity: 2, period: "Late Jurassic", length: 1.0, predator: true, packHunter: true,
      fact: "Rhamphorhynchus was a long-tailed pterosaur (not a dinosaur) that snatched fish from the lagoons of Solnhofen, steering with a diamond-shaped vane on its tail."
    },
    {
      id: "pteranodon", name: "Pteranodon", emoji: "🦅", biome: "water", realm: "air",
      terrainPrefs: { rock: 0.35, sand: 0.3, grass: 0.2, water: 0.15 },
      cost: 7500, "upkeep/day": 185, appeal: 52, space: 16, social: [1, 4], diet: "piscivore",
      foliage: ["pine", "boulder"],
      needsWater: true, needsShelter: false, needsRocks: true, minFence: 2, speed: 2.4, size: 1.2,
      lifespan: 1200, breedChance: 0.06, star: 3, danger: 0,
      site: "laramidia", rarity: 2, period: "Late Cretaceous", length: 1.8, predator: true,
      fact: "Pteranodon had a wingspan of around six metres and a bony crest on its toothless head; it was a pterosaur, a flying reptile, and not a dinosaur."
    },
    {
      id: "quetzalcoatlus", name: "Quetzalcoatlus", emoji: "🦅", biome: "savannah", realm: "air",
      terrainPrefs: { savannah: 0.35, grass: 0.3, dirt: 0.2, rock: 0.15 },
      cost: 15000, "upkeep/day": 380, appeal: 74, space: 28, social: [1, 2], diet: "carnivore",
      foliage: ["dead_tree", "boulder"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 3, speed: 1.6, size: 2.4,
      lifespan: 1400, breedChance: 0.03, star: 4, danger: 1,
      site: "laramidia", rarity: 4, period: "Late Cretaceous", length: 5.0, predator: true,
      fact: "Quetzalcoatlus stood about as tall as a giraffe and spanned roughly ten metres across the wings; a pterosaur, not a dinosaur, it stalked the ground on all fours."
    },
    {
      id: "deer", name: "Red deer", emoji: "🦌", biome: "forest", modern: true,
      terrainPrefs: { forest: 0.4, grass: 0.4, dirt: 0.2 },
      cost: 400, "upkeep/day": 10, appeal: 14, space: 8, social: [2, 8], diet: "herbivore",
      foliage: ["fern", "ginkgo", "horsetail"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 2, speed: 2.0, size: 1.0,
      lifespan: 900, breedChance: 0.12, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 2.0, predator: false,
      fact: "Red deer stags grow a new set of antlers every year, shedding the old ones each spring."
    },
    {
      id: "boar", name: "Wild boar", emoji: "🐗", biome: "forest", modern: true,
      terrainPrefs: { forest: 0.5, dirt: 0.3, grass: 0.2 },
      cost: 300, "upkeep/day": 9, appeal: 10, space: 5, social: [2, 6], diet: "omnivore",
      foliage: ["fern", "ginkgo"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 2, speed: 1.6, size: 0.7,
      lifespan: 800, breedChance: 0.2, star: 0, danger: 1,
      site: "", rarity: 1, period: "Present day", length: 1.5, predator: false,
      fact: "Wild boar root through the soil with their snouts, hunting for roots, acorns and grubs. Today's farm pigs were domesticated from them."
    },
    {
      id: "goat", name: "Mountain goat", emoji: "🐐", biome: "rock", modern: true,
      terrainPrefs: { rock: 0.5, grass: 0.3, dirt: 0.2 },
      cost: 250, "upkeep/day": 8, appeal: 9, space: 4, social: [2, 8], diet: "herbivore",
      foliage: ["horsetail", "rock_pile"],
      needsWater: false, needsShelter: false, needsRocks: true, minFence: 2, speed: 1.6, size: 0.6,
      lifespan: 800, breedChance: 0.15, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 1.3, predator: false,
      fact: "Goats have split hooves with grippy pads that let them scramble up steep, rocky slopes."
    },
    {
      id: "rabbit", name: "Rabbit", emoji: "🐇", biome: "grass", modern: true,
      terrainPrefs: { grass: 0.6, dirt: 0.2, savannah: 0.2 },
      cost: 100, "upkeep/day": 3, appeal: 6, space: 2, social: [2, 10], diet: "herbivore",
      foliage: ["horsetail", "fern"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 1, speed: 2.2, size: 0.25,
      lifespan: 500, breedChance: 0.4, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 0.45, predator: false,
      fact: "Rabbits have eyes set high on the sides of their heads, so they can see almost all the way round without turning."
    },
    {
      id: "seagull", name: "Seagull", emoji: "🐦", biome: "water", realm: "air", modern: true,
      terrainPrefs: { sand: 0.4, grass: 0.3, rock: 0.2, water: 0.1 },
      cost: 150, "upkeep/day": 4, appeal: 7, space: 3, social: [2, 10], diet: "omnivore",
      foliage: ["rock_pile"],
      needsWater: false, needsShelter: false, needsRocks: false, minFence: 1, speed: 2.4, size: 0.25,
      lifespan: 600, breedChance: 0.2, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 0.6, predator: false,
      fact: "Seagulls will eat almost anything, from fish and shellfish to the chips dropped by park guests."
    },
    {
      id: "heron", name: "Grey heron", emoji: "🐦", biome: "water", realm: "air", modern: true,
      terrainPrefs: { grass: 0.4, sand: 0.3, water: 0.3 },
      cost: 250, "upkeep/day": 6, appeal: 10, space: 4, social: [1, 3], diet: "piscivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 1.6, size: 0.5,
      lifespan: 700, breedChance: 0.1, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 0.95, predator: false,
      fact: "A grey heron can stand perfectly still in the shallows for many minutes before stabbing at a passing fish."
    },
    {
      id: "seal", name: "Grey seal", emoji: "🦭", biome: "water", realm: "sea", modern: true,
      terrainPrefs: { water: 0.7, sand: 0.3 },
      cost: 900, "upkeep/day": 22, appeal: 22, space: 8, social: [2, 8], diet: "piscivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 1.8, size: 0.8,
      lifespan: 900, breedChance: 0.1, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 1.7, predator: false,
      fact: "Seals are mammals that spend much of their lives at sea but come ashore to rest and to have their pups."
    },
    {
      id: "dolphin", name: "Bottlenose dolphin", emoji: "🐬", biome: "water", realm: "sea", modern: true,
      terrainPrefs: { water: 1.0 },
      cost: 2200, "upkeep/day": 55, appeal: 40, space: 12, social: [2, 8], diet: "piscivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 2.8, size: 0.9,
      lifespan: 1200, breedChance: 0.08, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 2.5, predator: false,
      fact: "Dolphins are mammals, not fish, and they find their way and their dinner with echolocation clicks."
    },
    {
      id: "fish_shoal", name: "Fish shoal", emoji: "🐟", biome: "water", realm: "sea", modern: true,
      terrainPrefs: { water: 1.0 },
      cost: 120, "upkeep/day": 3, appeal: 8, space: 3, social: [1, 4], diet: "omnivore",
      foliage: ["reed_clump"],
      needsWater: true, needsShelter: false, needsRocks: false, minFence: 1, speed: 2.0, size: 0.3,
      lifespan: 500, breedChance: 0.3, star: 0, danger: 0,
      site: "", rarity: 1, period: "Present day", length: 0.3, predator: false,
      fact: "Fish that swim in a tight shoal are safer from predators, because the group moves together and confuses any single attacker."
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
    { id: "sign", name: "Information sign", emoji: "🪧", cost: 45, kind: "deco", biome: "any", aesthetic: 1, inEnclosure: false },
    { id: "themepark_arch", name: "Midway Welcome Arch", emoji: "🎪", cost: 450, kind: "deco", biome: "any", aesthetic: 5, inEnclosure: false, star: 0, themepark: true, info: "Festive illuminated fairground archway welcoming guests to the midway." },
    { id: "bunting_poles", name: "Carnival Bunting Flags", emoji: "🎏", cost: 140, kind: "deco", biome: "any", aesthetic: 3, inEnclosure: false, star: 0, themepark: true, info: "Colourful triangular pennant flags strung between striped carnival poles." },
    { id: "funhouse_mirror", name: "Funhouse Mirrors", emoji: "🪞", cost: 220, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false, star: 0, themepark: true, info: "Wavy gilt-framed laughing mirrors that amuse passing guests." },
    { id: "balloon_arch", name: "Balloon Archway", emoji: "🎈", cost: 280, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false, star: 0, themepark: true, info: "Bright rainbow cluster arch of helium carnival balloons." },
    { id: "circus_lamp", name: "Festoon String Lights", emoji: "🏮", cost: 160, kind: "deco", biome: "any", aesthetic: 3, inEnclosure: false, star: 0, themepark: true, info: "Warm glowing fairground festoon bulbs on a striped pole." },
    { id: "clown_statue", name: "Jester Mascot Statue", emoji: "🤡", cost: 420, kind: "deco", biome: "any", aesthetic: 4, inEnclosure: false, star: 1, themepark: true, info: "Cheerful golden theme-park mascot statue on a striped plinth." }
  ],

  mapSizes: [
    { id: "small", name: "Small", n: 40, blurb: "40×40 — cozy, tight layout" },
    { id: "medium", name: "Medium", n: 56, blurb: "56×56 — classic balanced park" },
    { id: "large", name: "Large", n: 72, blurb: "72×72 — sprawling grounds" },
    { id: "huge", name: "Huge", n: 88, blurb: "88×88 — massive mega-park" }
  ],

  // Starting maps. bounds = playable tiles (inclusive); everything outside is "Outside your land".
  // gen = procedural parameters read by genMap() in 20f: hills {amp (levels), scale (tiles)}, ridge {j, wave, h, ramps[]}, canyon {j, wave, w, depth},
  // island {cx,cy,rx,ry, harm[[k,amp,phase]], bays[[angle,width,depth]], capes[[x,y,r]], islets[[x,y,r]], lagoon{x,y,r,ang}, river/river2{to: angle}} = the island outline (see notes/island.md; bounds here are only a fallback, genMap computes the real owned bounds),
  // mesas {n, r, h}, lakes {n, r:[min,max], depth}, paint [{t, n (noise 0..1 threshold), s (noise scale), hi/lo (height limits)}], scatter [[scenery id, count, [terrain ids], {nearWater}]]
  maps: [
    { id: "fern_meadow", name: "Fern Meadow", size: "Medium", bounds: { i0: 4, j0: 8, i1: 51, j1: 55 },
      blurb: "The classic start, now an island: gentle green meadow behind sandy beaches, a pond, a stream to the sea and a sheltered bay with a little islet.",
      gen: { base: "grass", hills: { amp: 2, scale: 14 }, lakes: { n: 1, r: [3, 4], depth: 2 },
        island: { cx: 28, cy: 27, rx: 23, ry: 19, harm: [[2, 0.07, 0.5], [3, 0.08, 1.9], [5, 0.04, 0.2]], bays: [[3.14, 0.5, 0.32], [-1.0, 0.35, 0.2]], islets: [[6, 11, 2.4], [50, 44, 1.8]], river: { to: 0.15 } },
        paint: [{ t: "dirt", n: 0.7, s: 6 }, { t: "forest", n: 0.66, s: 10 }],
        scatter: [["ginkgo", 8, ["grass", "forest"]], ["pine", 8, ["forest", "grass"]], ["bush", 10, ["grass", "forest"]], ["fern", 8, ["grass", "forest"]], ["horsetail", 6, ["grass", "dirt"]], ["boulder", 4, ["grass"]], ["reed_clump", 4, ["dirt", "grass"], { nearWater: true }]] } },
    { id: "pocket_paddock", name: "Pocket Paddock", size: "Small", bounds: { i0: 12, j0: 22, i1: 43, j1: 55 },
      blurb: "A small round islet of flat, cheap land with a duck pond. Every tile counts, so plan your enclosures carefully.",
      gen: { base: "grass", hills: { amp: 0, scale: 10 }, lakes: { n: 1, r: [2, 2.5], depth: 1 },
        island: { cx: 28, cy: 36, rx: 16, ry: 15.5, harm: [[2, 0.05, 1], [4, 0.04, 2]], bays: [[-2.4, 0.4, 0.14]], islets: [[11, 25, 1.6]] },
        paint: [{ t: "dirt", n: 0.78, s: 5 }],
        scatter: [["ginkgo", 3, ["grass"]], ["bush", 5, ["grass"]], ["fern", 3, ["grass"]], ["boulder", 2, ["grass"]]] } },
    { id: "lakeland", name: "Lakeland", size: "Large", bounds: { i0: 2, j0: 5, i1: 54, j1: 55 },
      blurb: "A broad, low island of lakes, reed beds and two rivers, with a sea lagoon on the east side. Perfect for swimmers and water-lovers, awkward for roads.",
      gen: { base: "grass", hills: { amp: 1.5, scale: 12 }, lakes: { n: 4, r: [4, 6], depth: 2 },
        island: { cx: 28, cy: 27, rx: 25.5, ry: 21, harm: [[2, 0.05, 2.2], [3, 0.05, 0.4], [6, 0.03, 1.1]], bays: [[2.2, 0.45, 0.25]], lagoon: { x: 44, y: 24, r: 5, ang: 0 }, islets: [[8, 7, 2], [48, 50, 2.2]], river: { to: 3.6 }, river2: { to: -1.9 } },
        paint: [{ t: "rainforest", n: 0.68, s: 9 }, { t: "dirt", n: 0.74, s: 6 }, { t: "forest", n: 0.7, s: 12 }],
        scatter: [["reed_clump", 20, ["dirt", "grass"], { nearWater: true }], ["horsetail", 14, ["grass", "dirt"]], ["tree_fern", 8, ["rainforest", "grass"]], ["jungle_tree", 6, ["rainforest"]], ["ginkgo", 8, ["grass", "forest"]], ["pine", 6, ["forest"]], ["fern", 10, ["rainforest", "grass"]], ["bush", 8, ["grass"]]] } },
    { id: "highland_ridge", name: "Highland Ridge", size: "Large", bounds: { i0: 3, j0: 3, i1: 52, j1: 55 },
      blurb: "A rugged island of rolling uplands, a long cliff line to the north and stony slopes under conifer forest, with a deep fjord and shingle coves. Dramatic and cheap to fill with rocks.",
      gen: { base: "grass", hills: { amp: 4, scale: 11 }, ridge: { j: 22, wave: 4, h: 6, ramps: [14, 41] }, lakes: { n: 1, r: [3, 4], depth: 2 },
        island: { cx: 28, cy: 27, rx: 24, ry: 23, harm: [[2, 0.09, 1.2], [3, 0.1, 2.6], [4, 0.07, 0.3], [7, 0.04, 0.9]], bays: [[-2.3, 0.28, 0.5], [0.8, 0.4, 0.3]], capes: [[50, 14, 3.5]], islets: [[4, 40, 2], [52, 52, 1.7]], river: { to: 2.2 } },
        paint: [{ t: "rock", hi: 4 }, { t: "forest", n: 0.52, s: 9 }, { t: "rock", n: 0.82, s: 5 }],
        scatter: [["pine", 24, ["forest", "grass", "rock"]], ["monkey_puzzle", 6, ["forest", "grass"]], ["snow_pine", 4, ["rock"]], ["boulder", 14, ["rock", "grass", "forest"]], ["rock_pile", 12, ["rock", "grass"]], ["bush", 10, ["grass", "forest"]], ["fern", 6, ["forest"]], ["log", 5, ["forest"]]] } },
    { id: "dry_gulch", name: "Dry Gulch", size: "Medium", bounds: { i0: 5, j0: 6, i1: 52, j1: 55 },
      blurb: "A sun-baked island of savannah and pale sand, split by a deep canyon and studded with flat-topped mesas, with a long cape to the east and an oasis pool. Cycads thrive; ferns do not.",
      gen: { base: "savannah", hills: { amp: 1.5, scale: 13 }, canyon: { j: 25, wave: 4, w: 3, depth: 4, ramps: [14, 38] }, mesas: { n: 4, r: 4.5, h: 4 }, lakes: { n: 1, r: [2.5, 3], depth: 1 },
        island: { cx: 27, cy: 27, rx: 21, ry: 19, harm: [[2, 0.06, 0.1], [3, 0.07, 1.4], [5, 0.05, 2.5]], bays: [[0.5, 0.35, 0.35]], capes: [[48, 31, 4.2], [41, 29, 4]], islets: [[6, 12, 2.2], [45, 8, 1.8]], river: { to: 3.0 } },
        paint: [{ t: "sand", n: 0.64, s: 8 }, { t: "dirt", lo: -2 }, { t: "rock", hi: 3 }],
        scatter: [["cycad", 16, ["savannah", "sand", "dirt"]], ["dead_tree", 10, ["savannah", "sand", "rock"]], ["bush", 8, ["savannah"]], ["boulder", 10, ["rock", "savannah", "sand"]], ["rock_pile", 8, ["rock", "savannah", "sand"]], ["horsetail", 3, ["dirt"]]] } },
    { id: "frostfield", name: "Frostfield", size: "Medium", bounds: { i0: 5, j0: 7, i1: 50, j1: 55 },
      blurb: "A frozen island of snowdrifts and dark conifer stands, with icy tarns, a meltwater river, pale shingle beaches and drifting floes offshore.",
      gen: { base: "snow", hills: { amp: 3, scale: 12 }, lakes: { n: 3, r: [3, 5], depth: 2 },
        island: { cx: 28, cy: 27, rx: 22, ry: 19.5, harm: [[2, 0.06, 2.0], [3, 0.09, 0.9], [5, 0.05, 1.7]], bays: [[2.6, 0.4, 0.28], [-0.4, 0.3, 0.22]], islets: [[7, 8, 2], [51, 12, 1.6], [48, 48, 2]], river: { to: -2.8 } },
        paint: [{ t: "forest", n: 0.58, s: 8 }, { t: "rock", hi: 4 }],
        scatter: [["snow_pine", 26, ["snow", "forest", "rock"]], ["pine", 8, ["forest"]], ["ice_floe", 6, ["water"]], ["boulder", 8, ["snow", "rock"]], ["rock_pile", 6, ["snow", "rock"]], ["fern", 4, ["forest"]], ["bush", 4, ["forest"]]] } }
  ],

  buildings: [
    { id: "burger_stand", name: "Burger stand", emoji: "🍔", cost: 1200, upkeep: 20, type: "food", price: 6, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.5 }, star: 0,
      info: "Quick hot food stall (serves 4 at once, -50% hunger). Entrance must touch a path." },
    { id: "pizza_hut", name: "Pizza kiosk", emoji: "🍕", cost: 1800, upkeep: 30, type: "food", price: 8, capacity: 6, w: 2, h: 1, satisfies: { hunger: 0.6 }, star: 0,
      info: "Hearty pizza kiosk (serves 6 at once, -60% hunger). Entrance must touch a path." },
    { id: "ice_cream", name: "Ice cream kiosk", emoji: "🍦", cost: 600, upkeep: 12, type: "food", price: 4, capacity: 3, w: 1, h: 1, satisfies: { hunger: 0.2, fun: 0.1 }, star: 0,
      info: "Cold treat stall (serves 3 at once, -20% hunger, +10% fun). Entrance must touch a path." },
    { id: "drinks_stall", name: "Drinks stall", emoji: "🥤", cost: 500, upkeep: 8, type: "drink", price: 3, capacity: 4, w: 1, h: 1, satisfies: { thirst: 0.6 }, star: 0,
      info: "Cold drinks stand (serves 4 at once, -60% thirst). Entrance must touch a path." },
    { id: "coffee_cart", name: "Coffee cart", emoji: "☕", cost: 700, upkeep: 10, type: "drink", price: 4, capacity: 3, w: 1, h: 1, satisfies: { thirst: 0.4, energy: 0.3 }, star: 0,
      info: "Hot coffee cart (serves 3 at once, -40% thirst, +30% energy). Entrance must touch a path." },
    { id: "toilets", name: "Toilets", emoji: "🚻", cost: 600, upkeep: 10, type: "toilet", price: 0, capacity: 8, w: 2, h: 1, satisfies: { bladder: 1 }, star: 0,
      info: "Park restrooms (8 stalls, free to use, full comfort). Entrance must touch a path." },
    { id: "gift_shop", name: "Gift shop", emoji: "🎁", cost: 2500, upkeep: 30, type: "shop", price: 12, capacity: 6, w: 2, h: 2, satisfies: { fun: 0.2 }, star: 1,
      info: "Souvenir shop (capacity 6, +20% fun, high ticket spend). Entrance must touch a path." },
    { id: "balloon_stand", name: "Balloon stand", emoji: "🎈", cost: 350, upkeep: 5, type: "shop", price: 5, capacity: 2, w: 1, h: 1, satisfies: { fun: 0.2 }, star: 0, themepark: true,
      info: "Compact souvenir stand (capacity 2, +20% fun). Entrance must touch a path." },
    { id: "carousel", name: "Carousel", emoji: "🎠", cost: 5000, upkeep: 70, type: "ride", price: 6, capacity: 12, w: 3, h: 3, satisfies: { fun: 0.8 }, star: 1, themepark: true,
      info: "Dinosaur ride for guests (capacity 12, +80% fun and mood boost). Entrance must touch a path." },
    { id: "info_kiosk", name: "Info kiosk", emoji: "ℹ️", cost: 300, upkeep: 4, type: "info", price: 0, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.05 }, star: 0,
      info: "Park map and guide booth (capacity 4, free). Entrance must touch a path." },
    { id: "viewing_platform", name: "Viewing platform", emoji: "🔭", cost: 1800, upkeep: 15, type: "info", price: 0, capacity: 20, w: 2, h: 1, satisfies: { fun: 0.3 }, star: 0,
      info: "Raised lookout (capacity 20, +30% fun): draws guests to view enclosures and boosts donations nearby. Entrance must touch a path." },
    { id: "restaurant", name: "Restaurant", emoji: "🍽️", cost: 8000, upkeep: 120, type: "food", price: 14, capacity: 30, w: 4, h: 3, satisfies: { hunger: 1, thirst: 0.3, energy: 0.3 }, star: 2,
      info: "Full sit-down dining (capacity 30, full hunger, -30% thirst, +30% energy). Entrance must touch a path." },
    { id: "keeper_hut", name: "Ranger station", emoji: "🛖", cost: 1200, upkeep: 12, type: "staff", price: 0, capacity: 6, w: 2, h: 2, satisfies: {}, star: 0,
      info: "Radio & dispatch hub: extends ranger base range from 32 to 48 tiles and adds a 48-tile station relay zone. Entrance must touch a path." },
    { id: "vet_clinic", name: "Vet clinic", emoji: "🏥", cost: 3500, upkeep: 50, type: "staff", price: 0, capacity: 4, w: 3, h: 2, satisfies: {}, star: 1,
      info: "Veterinary triage & dispatch hub: cuts vet treatment time park-wide and adds a 48-tile full-recovery clinic zone. Entrance must touch a path." },
    { id: "education_centre", name: "Discovery museum", emoji: "🎓", cost: 9000, upkeep: 90, type: "info", price: 5, capacity: 40, w: 4, h: 3, satisfies: { fun: 0.5 }, star: 2,
      info: "Museum (capacity 40, +50% fun): boosts guest donations park-wide (+50% amount). Entrance must touch a path." },
    { id: "emergency_bunker", name: "Emergency bunker", emoji: "🚨", cost: 3000, upkeep: 25, type: "info", price: 0, capacity: 30, w: 2, h: 2, satisfies: {}, star: 1,
      info: "Guest shelter during dinosaur escapes (capacity 30); lowers injury risk while animals are loose. Entrance must touch a path." },
    { id: "hatchery", name: "Hatchery", emoji: "🥚", cost: 4000, upkeep: 40, type: "science", price: 0, capacity: 2, w: 3, h: 2, satisfies: {}, star: 0,
      info: "Incubates dinosaur eggs (adds 2 egg slots). Needs power and a path at its entrance." },
    { id: "research_lab", name: "Research lab", emoji: "🔬", cost: 6000, upkeep: 90, type: "science", price: 0, capacity: 2, w: 4, h: 3, satisfies: {}, star: 0,
      info: "Houses scientists for amber extraction and DNA splicing. Needs power and a path at its entrance." },
    { id: "coaster_wooden", name: "Wooden Coaster Station", emoji: "🎢", cost: 3200, upkeep: 45, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "wooden", thrill: 2, price: 8, capacity: 20, w: 4, h: 2, satisfies: { fun: 0.95 }, star: 0, themepark: true, info: "Place this entrance station and drag custom wooden coaster track in a loop back to the station. Raise hills and add Chain Lifts!" },
    { id: "coaster_mine", name: "Mine Train Station", emoji: "⛏️", cost: 4200, upkeep: 55, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "mine", thrill: 3, price: 10, capacity: 20, w: 4, h: 2, satisfies: { fun: 0.94 }, star: 1, themepark: true, info: "Custom rugged mine-cart coaster station. Supports hills, Chain Lifts and Launch Boosts." },
    { id: "coaster_flume", name: "Log Flume Station", emoji: "🪵", cost: 5000, upkeep: 65, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "flume", thrill: 3, price: 11, capacity: 16, w: 4, h: 2, satisfies: { fun: 0.96, thirst: 0.12 }, star: 2, themepark: true, info: "Custom elevated water-chute station. Pair high drops with Water Splash troughs for massive guest thrills." },
    { id: "coaster_steel", name: "Steel Thrill Coaster Station", emoji: "⚡", cost: 6800, upkeep: 85, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "steel", thrill: 5, price: 14, capacity: 24, w: 4, h: 2, satisfies: { fun: 1.0 }, star: 3, themepark: true, info: "High-speed tubular steel coaster station. Unlocks Loop-de-Loops, Corkscrews and Launch Boosts!" },
    { id: "coaster_hyper", name: "Mythical Hyper Coaster Station", emoji: "🐉", cost: 9500, upkeep: 115, type: "ride", rideKind: "coaster", coasterStation: true, coasterType: "hyper", thrill: 5, price: 18, capacity: 24, w: 4, h: 2, satisfies: { fun: 1.0 }, star: 4, themepark: true, info: "Enchanted sky-high dragon coaster supporting every special element, extreme heights and blistering speed." },
    { id: "wooden_coaster", name: "Wooden Rollercoaster", emoji: "🎢", cost: 7500, upkeep: 95, type: "ride", rideKind: "coaster", thrill: 3, price: 10, capacity: 16, w: 5, h: 4, satisfies: { fun: 0.95 }, star: 2, themepark: true, legacyCoaster: true, info: "Classic timber rollercoaster with rattling lift hill, camelback drops and screaming guests (capacity 16, +95% fun). Entrance must touch a path." },
    { id: "loop_coaster", name: "Steel Loop Coaster", emoji: "➿", cost: 11000, upkeep: 140, type: "ride", rideKind: "coaster", thrill: 5, price: 14, capacity: 20, w: 6, h: 4, satisfies: { fun: 1.0 }, star: 3, themepark: true, legacyCoaster: true, info: "High-speed steel inversion coaster with a towering vertical loop and banked helix (capacity 20, +100% fun). Entrance must touch a path." },
    { id: "mine_coaster", name: "Runaway Mine Train", emoji: "🛤️", cost: 6200, upkeep: 80, type: "ride", rideKind: "coaster", thrill: 2, price: 8, capacity: 14, w: 4, h: 3, satisfies: { fun: 0.85 }, star: 1, themepark: true, legacyCoaster: true, info: "Family rocky canyon mine-cart coaster spiralling around craggy boulders (capacity 14, +85% fun). Entrance must touch a path." },
    { id: "log_flume", name: "Splash Log Flume", emoji: "🪵", cost: 8500, upkeep: 110, type: "ride", rideKind: "coaster", thrill: 3, price: 11, capacity: 16, w: 4, h: 4, satisfies: { fun: 0.92, thirst: 0.1 }, star: 2, themepark: true, legacyCoaster: true, info: "Elevated water chute ride ending in a refreshing splashdown drop (capacity 16, +92% fun). Entrance must touch a path." },
    { id: "ferris_wheel", name: "Giant Ferris Wheel", emoji: "🎡", cost: 6800, upkeep: 85, type: "ride", rideKind: "wheel", thrill: 2, price: 9, capacity: 18, w: 3, h: 3, satisfies: { fun: 0.88, energy: 0.1 }, star: 2, themepark: true, info: "Revolving observation wheel giving guests sweeping views over the dinosaur park and theme park (capacity 18, +88% fun). Entrance must touch a path." },
    { id: "rubber_duck_stand", name: "Hook-a-Duck Stall", emoji: "🦆", cost: 900, upkeep: 14, type: "arcade", price: 5, capacity: 4, w: 2, h: 1, satisfies: { fun: 0.45 }, star: 0, themepark: true, info: "Classic fairground rubber-ducking water trough where guests hook floating yellow ducks for prizes (capacity 4, +45% fun). Entrance must touch a path." },
    { id: "air_rifle_stand", name: "Air Rifle Shooting Gallery", emoji: "🎯", cost: 1300, upkeep: 18, type: "arcade", price: 6, capacity: 6, w: 2, h: 2, satisfies: { fun: 0.55 }, star: 1, themepark: true, info: "Cork & tin-can air-rifling gallery with moving mechanical targets and bullseyes (capacity 6, +55% fun). Entrance must touch a path." },
    { id: "ring_toss_stand", name: "Ring Toss Stall", emoji: "⭕", cost: 850, upkeep: 12, type: "arcade", price: 4, capacity: 4, w: 1, h: 1, satisfies: { fun: 0.4 }, star: 0, themepark: true, info: "Carnival bottle ring-toss booth stacked with giant plush prizes (capacity 4, +40% fun). Entrance must touch a path." },
    { id: "whack_a_mole", name: "Whack-a-Dino Arcade", emoji: "🔨", cost: 1100, upkeep: 16, type: "arcade", price: 5, capacity: 6, w: 2, h: 1, satisfies: { fun: 0.5 }, star: 1, themepark: true, info: "Rowdy mallet arcade cabinet where pop-up dinosaurs test guests' reflexes (capacity 6, +50% fun). Entrance must touch a path." },
    { id: "high_striker", name: "Strongman High Striker", emoji: "🔔", cost: 950, upkeep: 12, type: "arcade", price: 5, capacity: 3, w: 1, h: 2, satisfies: { fun: 0.48 }, star: 0, themepark: true, info: "Towering carnival bell-ringer where guests swing a heavy mallet to ring the top gong (capacity 3, +48% fun). Entrance must touch a path." },
    { id: "candy_floss", name: "Candy Floss Stand", emoji: "🍭", cost: 750, upkeep: 12, type: "food", price: 5, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.22, fun: 0.25 }, star: 0, themepark: true, info: "Spins clouds of pink and blue spun sugar on a stick (serves 4, -22% hunger, +25% fun). Entrance must touch a path." },
    { id: "popcorn_stand", name: "Popcorn Kiosk", emoji: "🍿", cost: 800, upkeep: 14, type: "food", price: 5, capacity: 4, w: 1, h: 1, satisfies: { hunger: 0.25, fun: 0.18 }, star: 0, themepark: true, info: "Buttery kettle-popped corn in classic red-and-white striped tubs (serves 4, -25% hunger, +18% fun). Entrance must touch a path." },
    { id: "hot_dog_stand", name: "Hot Dog Cart", emoji: "🌭", cost: 1100, upkeep: 18, type: "food", price: 6, capacity: 6, w: 2, h: 1, satisfies: { hunger: 0.48, fun: 0.1 }, star: 0, themepark: true, info: "Sizzling fairground frankfurters topped with mustard and ketchup (serves 6, -48% hunger, +10% fun). Entrance must touch a path." },
    { id: "slushie_bar", name: "Slushie & Soda Bar", emoji: "🧊", cost: 850, upkeep: 14, type: "drink", price: 4, capacity: 6, w: 2, h: 1, satisfies: { thirst: 0.65, fun: 0.15 }, star: 1, themepark: true, info: "Brain-freezing neon cherry and blue-raspberry ice slushies (serves 6, -65% thirst, +15% fun). Entrance must touch a path." }
  ],

  staff: [
    { id: "keeper", name: "Ranger", emoji: "🧑‍🌾", "wage/day": 60, hireCost: 150, effect: "Feeds dinosaurs, cleans enclosures & responds by radio (32t range; 48t + station hubs with a Ranger station)" },
    { id: "vet", name: "Vet", emoji: "🩺", "wage/day": 120, hireCost: 800, effect: "Treats sick & injured dinosaurs on reachable paths (responds immediately by radio)" },
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
    { id: "european", name: "Solnhofen and Weald Clay", blurb: "Shallow lagoons and clay beds across Europe, from Bavarian limestone to the English Weald.", star: 0, species: ["compsognathus", "baryonyx", "ichthyosaurus", "liopleurodon", "dimorphodon", "rhamphorhynchus"], basePrice: 340 },
    { id: "gobi", name: "Djadochta Formation", blurb: "Dry Late Cretaceous dunes of the Gobi, where fierce hunters and horned grazers were buried in sand.", star: 1, species: ["protoceratops", "gallimimus", "velociraptor", "therizinosaurus"], basePrice: 600 },
    { id: "polar", name: "Dinosaur Cove and Hanson Formation", blurb: "Cold, dark forests near the poles, where small dinosaurs endured months of winter night.", star: 2, species: ["leaellynasaura", "cryolophosaurus"], basePrice: 850 },
    { id: "laramidia", name: "Hell Creek Formation", blurb: "Late Cretaceous floodplains of North America, home to tyrant lizards and the last great horned herds.", star: 2, species: ["pachycephalosaurus", "parasaurolophus", "triceratops", "ankylosaurus", "tyrannosaurus", "pteranodon", "quetzalcoatlus", "archelon", "elasmosaurus", "mosasaurus"], basePrice: 940 },
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
    { id: "rating_4", text: "Reach a 4-star park rating", type: "rating", target: 4, reward: 8000 },
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
    enclosureCrowded: [
      "There are too many animals in that enclosure.",
      "Those animals look cramped.",
      "I hope the park gives them more room."
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
    ],
    coaster: [
      "Hands up on the rollercoaster!",
      "That drop on the coaster was wicked!",
      "My heart is still racing from that ride!",
      "Best rollercoaster in any park!"
    ],
    coasterCustom: [
      "What a brilliant custom rollercoaster!",
      "I loved flying over the park on that track!",
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
      "You can see the dinosaurs right from the coaster track!",
      "Flying above the dinosaur enclosures is amazing!"
    ],
    coasterStuck: [
      "Uh oh, the coaster train has stopped on the track!",
      "Hope a mechanic gets us moving again soon!"
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
        id: "hyper", name: "Mythical Hyper Coaster", stationId: "coaster_hyper", star: 4,
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
    "A genome above 50% lets you incubate that species in the hatchery.",
    "Rain and storms keep guests away, so build shelter, benches and indoor attractions.",
    "Heatwaves make guests thirsty: keep drinks stalls and ice cream kiosks stocked up.",
    "Storms put dinosaurs on edge and can damage fences. Strong fences and security guards pay off.",
    "Your first amber extraction is guaranteed to work, so you can start the lab straight away.",
    "Amber prices swing with the market: check back after a slump for bargains.",
    "Days are long, so running costs add up: watch the daily report in the finance tab.",
    "Staff and building upkeep are paid at midnight. Keep a cash buffer to cover them.",
    "A warning appears if your balance drops dangerously low: sell something or take a loan in time.",
    "Extraction gives DNA fragments, not a genome. Free scientists sequence them in the background, and the puzzle boost speeds it up.",
    "Keep one scientist free: sequencing only happens while somebody is not busy with an extraction or a splice.",
    "The park is an island. Only fresh water in lakes, rivers and ponds counts as drinking water for animals, not the sea.",
    "A moat holds an animal only if it is wide and deep enough for that species. Swimmers such as Spinosaurus cross water as if it were not there.",
    "Electric fences fall to strength 1 when the power is off. Build a backup generator and a battery bank before the storms arrive.",
    "Answer bad headlines quickly: an apology is cheap, and silence lets a story grow.",
    "Unsure what to do next? Watch a Masterclass from the title screen or the Guide tab to see whole parks played well and badly."
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
    { id: "easy", name: "Relaxed", blurb: "Plenty of starting cash, cheaper running costs and busier gates. Good for learning the ropes.", money: 35000, income: 1.1, costs: 0.85, arrivals: 1.1, interest: 0.006 },
    { id: "normal", name: "Standard", blurb: "A fair challenge. Careful planning turns a modest profit; careless spending sinks the park.", money: 22000, income: 1, costs: 1, arrivals: 1, interest: 0.01 },
    { id: "hard", name: "Tycoon", blurb: "Lean starting funds, dearer upkeep, fewer guests and costly loans. Every pound counts.", money: 15000, income: 0.92, costs: 1.2, arrivals: 0.9, interest: 0.016 }
  ]
};

// ===== DNA package (donor animals, donor genes, hybrid goals) - appended tables =====
// Donors are modern animals whose DNA can be bought from the conservation gene bank, found on expeditions, or delivered by Z.Sim.research.addDonor().
// Each donor carries one named gene. The genes are appended to D.traits (same mechanism as the five home-lab traits) with extra fields:
//   donor (donor id needed to splice), fx (gameplay modifiers, read by the sim), look (visible feature, read by Z.Models via the `mods` hook).
// fx keys: appeal (+fraction), nightAppeal (+fraction at dusk), q (genome stability points), sick (illness multiplier), life, speed, upkeep, breed (multipliers),
//          fence (+min fence strength), danger (+danger), sterile (no breeding), swim (amphibious), terrain {terrainId: weight} (extra liked ground).
window.Z.DATA.donors = [
  { id: "chameleon", name: "Veiled chameleon", emoji: "🦎", price: 1100, star: 0, realm: "land", gene: "chameleon_skin", blurb: "Colour-changing skin cells from a lizard that wears its mood on its sleeve." },
  { id: "frog", name: "Tree frog", emoji: "🐸", price: 900, star: 0, realm: "land", gene: "frog_repair", blurb: "Amphibian repair genes, handy for patching gaps in damaged sequences." },
  { id: "tortoise", name: "Giant tortoise", emoji: "🐢", price: 1300, star: 0, realm: "land", gene: "tortoise_shell", blurb: "A slow-living, very long-lived reptile with a shell to match." },
  { id: "peacock", name: "Indian peafowl", emoji: "🦚", price: 1500, star: 1, realm: "air", gene: "peacock_fan", blurb: "Display genes for a spectacular, shimmering tail fan." },
  { id: "arctic_fox", name: "Arctic fox", emoji: "🦊", price: 1500, star: 1, realm: "land", gene: "fox_coat", blurb: "A dense white winter coat that copes with snow and ice." },
  { id: "crocodile", name: "Nile crocodile", emoji: "🐊", price: 1900, star: 1, realm: "land", gene: "croc_hide", blurb: "Armoured skin and an iron constitution from a living relative of the dinosaurs." },
  { id: "ostrich", name: "Ostrich", emoji: "🪶", price: 1700, star: 1, realm: "land", gene: "ostrich_legs", blurb: "Long running legs and a famously busy breeding season." },
  { id: "bat", name: "Horseshoe bat", emoji: "🦇", price: 1700, star: 2, realm: "air", gene: "bat_sonar", blurb: "Echolocation and big ears: at home in the dark." },
  { id: "eagle", name: "Golden eagle", emoji: "🦅", price: 2100, star: 2, realm: "air", gene: "eagle_eye", blurb: "Raptor eyesight and golden nape feathers." },
  { id: "cheetah", name: "Cheetah", emoji: "🐆", price: 2300, star: 2, realm: "land", gene: "cheetah_sprint", blurb: "Sprint muscle from the fastest land animal alive." },
  { id: "jellyfish", name: "Crystal jellyfish", emoji: "🪼", price: 2400, star: 3, realm: "sea", gene: "glow_protein", blurb: "The green fluorescent protein that makes jellyfish glow." },
  { id: "electric_eel", name: "Electric eel", emoji: "⚡", price: 2600, star: 3, realm: "sea", gene: "eel_organ", blurb: "An electric organ that can deliver a shock strong enough to stun prey." }
];
(function (D) {
  var G = [
    { id: "chameleon_skin", name: "Colour-shifting skin", emoji: "🌈", cost: 5200, donor: "chameleon", effect: "Skin that slowly shifts through new colours. Guests adore it.",
      fx: { appeal: 0.3, sick: 1.15 }, look: { shift: 1 } },
    { id: "frog_repair", name: "Amphibian repair genes", emoji: "🐸", cost: 4800, donor: "frog", effect: "Fills gaps in the genome, so animals are sturdier and can swim.",
      fx: { q: 12, sick: 0.75, breed: 0.9, swim: 1 }, look: { tint: [0.78, 1.12, 0.7] } },
    { id: "tortoise_shell", name: "Tortoise longevity", emoji: "🐢", cost: 6200, donor: "tortoise", effect: "Far longer lives and tougher health, with a bony shell on the back. Slower.",
      fx: { life: 1.6, sick: 0.9, speed: 0.75 }, look: { shell: 1 } },
    { id: "peacock_fan", name: "Display fan", emoji: "🦚", cost: 6400, donor: "peacock", effect: "A spectacular fan of eyed feathers that raises the appeal of the animal.",
      fx: { appeal: 0.35, upkeep: 1.15 }, look: { fan: 1 } },
    { id: "fox_coat", name: "Arctic coat", emoji: "❄️", cost: 5600, donor: "arctic_fox", effect: "A thick pale coat. The animal is happy on snow as well as its usual ground.",
      fx: { appeal: 0.1, terrain: { snow: 0.6 } }, look: { tint: [1.45, 1.45, 1.5] } },
    { id: "croc_hide", name: "Crocodilian hide", emoji: "🐊", cost: 7000, donor: "crocodile", effect: "Armoured, cheaper to keep and long-lived, but a good deal more dangerous.",
      fx: { sick: 0.8, life: 1.15, upkeep: 0.85, danger: 1, fence: 1 }, look: { spikes: 1, tint: [0.78, 0.95, 0.72] } },
    { id: "ostrich_legs", name: "Ostrich legs", emoji: "🪶", cost: 5800, donor: "ostrich", effect: "Longer legs: a little quicker and a lot more fertile, but hungrier.",
      fx: { speed: 1.15, breed: 1.3, upkeep: 1.1 }, look: { scale: 1.08, crest: 1 } },
    { id: "bat_sonar", name: "Bat echolocation", emoji: "🦇", cost: 6000, donor: "bat", effect: "Big ears and night vision. Wonderful at dusk, a little sleepy by day.",
      fx: { nightAppeal: 0.5, appeal: -0.1, sick: 0.9 }, look: { ears: 1, tint: [0.82, 0.78, 0.95] } },
    { id: "eagle_eye", name: "Raptor eye and plumage", emoji: "🦅", cost: 6600, donor: "eagle", effect: "A crest of feathers and quick reactions, but it tests every fence.",
      fx: { appeal: 0.12, speed: 1.12, fence: 1 }, look: { crest: 1 } },
    { id: "cheetah_sprint", name: "Sprinter muscle", emoji: "🐆", cost: 7200, donor: "cheetah", effect: "Spotted coat and a big boost in speed, but it tests every fence and burns out sooner.",
      fx: { speed: 1.4, fence: 1, life: 0.9 }, look: { spots: 1, tint: [1.1, 1.0, 0.78] } },
    { id: "glow_protein", name: "Bioluminescence", emoji: "✨", cost: 7800, donor: "jellyfish", effect: "Glowing patches that light up the dusk. A huge draw in the evening.",
      fx: { nightAppeal: 0.9, upkeep: 1.1 }, look: { glow: [0.3, 1, 0.65] } },
    { id: "eel_organ", name: "Electric organ", emoji: "⚡", cost: 8200, donor: "electric_eel", effect: "Crackling blue light and a nasty shock. Popular, but dangerous and sterile.",
      fx: { appeal: 0.25, danger: 1, sterile: 1 }, look: { glow: [0.45, 0.8, 1], glowK: 0.55 } }
  ];
  G.forEach(function (g) { D.traits.push(g); });
  D.goals.push(
    { id: "first_sequenced", text: "Finish sequencing your first batch of DNA fragments", type: "sequenced", target: 1, reward: 900 },
    { id: "puzzles_3", text: "Help the scientists with 3 sequencing puzzles", type: "puzzles", target: 3, reward: 1200 },
    { id: "first_gene", text: "Splice a donor gene from a modern animal", type: "genes", target: 1, reward: 4000 },
    { id: "first_hybrid", text: "Create your first hybrid species", type: "hybrids", target: 1, reward: 9000 }
  );
})(window.Z.DATA);

// ===== moats package (ditches, moats, pumps, boreholes, bridges) =====
(function (D) {
  D.moats = {
    // dig cost per tile by depth level (1 shallow .. 3 deep); filling in refunds 50%
    depths: [
      { id: 1, name: 'Shallow', cost: 20, world: 0.8, blurb: '1 m deep' },
      { id: 2, name: 'Medium', cost: 36, world: 1.6, blurb: '2 m deep' },
      { id: 3, name: 'Deep', cost: 56, world: 2.4, blurb: '3.5 m deep' }
    ],
    bridge: { maxSpan: 6, mult: 4, flat: 20 },                 // bridge tile cost = path cost x mult + flat
    // water supply, in "depth units" (one tile of a Medium ditch = 2 units). Lakes give lakeCap per lake tile; a river system is generous.
    supply: { lakeCap: 8, riverCap: 900, seaCap: 1200 },
    // Species overrides. Anything not listed is DERIVED in 23-sim-moats.js (reqFor): ditchWidth = tiles it can leap (from length x agility from speed),
    // ditchDepth = depth level it can climb out of (from size), swims (marine realm, piscivores, hybrids of swimmers). Other agents' species need no entry.
    species: {
      spinosaurus: { swims: true }, baryonyx: { swims: true },
      goat: { ditchDepth: 3 }, boar: { ditchDepth: 2 }
    }
  };
  D.buildings.push(
    { id: 'pump_station', name: 'Pump station', emoji: '⛲', cost: 3200, upkeep: 40, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 0, needsPower: true,
      moat: { source: 'pump', cap: 160 }, info: 'Supplies 160 units of water from a lake, river or sea into a ditch it touches. Stand it beside water (draws 8 kW).' },
    { id: 'borehole', name: 'Borehole', emoji: '🕳️', cost: 1600, upkeep: 75, type: 'utility', utility: true, price: 0, capacity: 0, w: 1, h: 1, satisfies: {}, star: 0, needsPower: true,
      moat: { source: 'borehole', cap: 40 }, info: 'Taps groundwater anywhere for 40 units of fresh water into a ditch it touches (draws 3.5 kW; high upkeep).' }
  );
  D.goals.push({ id: 'moat_only', text: 'House a species behind a moat with no fence', type: 'moat', target: 1, reward: 2500 });
})(window.Z.DATA);

// ===== monorail package (elevated track, stations, trains) =====
(function (D) {
  D.monorail = {
    trackCost: 48, waterExtra: 70, refund: 0.5,           // per track tile; extra for a tile over water; removal refunds 50%
    clearance: 5.2, stationDeck: 4.8, maxSlope: 1.0,      // world units: beam height above the ground, station platform height, steepest rise per tile
    maxSpan: 5, prefSpan: 3,                               // tiles between pylons (max / usual)
    trainCost: 6500, carCost: 1400, trainUpkeep: 55, carUpkeep: 10, minCars: 2, maxCars: 4, maxTrains: 3, refundTrain: 0.6,
    capacity: 8, carLen: 2.9, carGap: 0.22,                // guests per carriage, carriage length (world units)
    speed: 8.5, accel: 2.4, decel: 2.8, dwell: 7,          // cruising speed (units/s), easing, base dwell time (s)
    fare: 5, fareMax: 20, fareRef: 5,                      // default fare, slider maximum, fare guests consider "standard"
    viewRadius: 4, viewMul: 1.55,                          // tiles either side of the beam that count as overlooked; strong viewing bonus
    breakdownPerHour: 0.006, lightningPerHour: 0.07, fixTime: [18, 70], engineerTime: [70, 110], engineerFee: 150, callOutFee: 150,
    weatherSpeed: { clear: 1, cloudy: 1, rain: 0.85, storm: 0.55, heatwave: 1, fog: 0.8 }
  };
  D.buildings.push(
    { id: 'monorail_station', name: 'Monorail station', emoji: '🚝', cost: 5200, upkeep: 45, type: 'transport', price: 0, capacity: 0, w: 4, h: 2, satisfies: {}, star: 2, needsPower: true, mono: true,
      info: 'A raised platform for the monorail. The entrance must touch a path; the beam runs along the platform and joins track at either end.' }
  );
  D.goals.push(
    { id: 'mono_riders', text: 'Carry 200 monorail passengers', type: 'monoRiders', target: 200, reward: 4000 },
    { id: 'mono_over3', text: 'Run a monorail line over three enclosures', type: 'monoEnclosures', target: 3, reward: 5500 }
  );
  D.guestThoughts.monorail = [
    "What a view from up here!", "I can see the whole park from the monorail.", "Much quicker than walking.", "The monorail is the best bit of the day.",
    "Look at the {animal} from above, wonderful!", "Floating over the park, just lovely."
  ];
  D.guestThoughts.monorailDanger = [
    "The {animal} looked right up at us from the monorail!", "Safe behind the mesh, but that {animal} is huge!",
    "That {animal} is enormous from up here, and the carriage rattled!", "I could have counted the {animal}'s teeth from here."
  ];
  D.guestThoughts.monorailStuck = [
    "Why have we stopped?", "We are stuck up in the air!", "How long will this take?", "I want to get down!", "Is the monorail broken?"
  ];
  D.guestThoughts.monorailQueue = ["Where is the monorail?", "I hope the train is not far off.", "Standing on a platform in the rain..."];
})(window.Z.DATA);

// ===== boats package (floating pontoons, guest and service piers, VIP and staff helipads) =====
(function (D) {
  D.boats = {
    fare: 6, fareMax: 25, fareRef: 6,                      // default boat fare, slider maximum, fare guests consider "standard"
    speed: 5, minTrip: 8,                                  // boat speed (units/s); shortest trip length counted (units)
    airSpeed: 14, airAlt: 14,                              // staff helicopter hop: speed (units/s), cruising height
    vip: { fee: 150, every: [50, 110], spend: 5, demand: 8, flyIn: 7, flyOut: 6 }   // arrival fee, seconds between arrivals (before rating), spending multiple, happiness they demand, rotor times
  };
  D.paths.push(
    { id: 'pontoon', name: 'Floating pontoon', cost: 60, colour: '#b08a5a', speed: 1.0, pontoon: true, blurb: 'A floating deck. Goes on any water, fresh or sea, with no span limit.' }
  );
  D.buildings.push(
    { id: 'guest_pier', name: 'Guest pier', emoji: '⛴️', cost: 3200, upkeep: 20, type: 'transport', price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 1, boats: 'guest',
      info: 'A landing for guest boats. It must touch the shore with a path at its entrance. Piers on the same water carry guests between separate parts of the park.' },
    { id: 'service_pier', name: 'Service pier', emoji: '🚤', cost: 2400, upkeep: 12, type: 'transport', price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 2, boats: 'service',
      info: 'A staff-only landing. Keepers, vets, cleaners and mechanics use it to reach paths that cannot be walked to. Guests never use it.' },
    { id: 'staff_helipad', name: 'Staff helipad', emoji: '🚁', cost: 4500, upkeep: 25, type: 'transport', price: 0, capacity: 0, w: 3, h: 3, satisfies: {}, star: 2, boats: 'staff',
      info: 'A small pad for staff transfers. Any two staff helipads link their paths for staff, over land or water.' },
    { id: 'vip_helipad', name: 'VIP helipad', emoji: '🚁', cost: 28000, upkeep: 180, type: 'transport', price: 0, capacity: 0, w: 5, h: 5, satisfies: {}, star: 3, boats: 'vip',
      info: 'VIP guests fly in and out by helicopter, pay a large arrival fee, spend much more and expect more. The pad must have a path at its entrance.' }
  );
  D.guestThoughts.boat = ['What a lovely little boat trip!', 'Much nicer than walking round the lake.', 'I can see the whole shoreline from here.', 'Smooth sailing!'];
  D.guestThoughts.vip = ['I expect better service for this price.', 'Is there anywhere quieter to view the animals?', 'The helicopter ride was the best part.'];
})(window.Z.DATA);

// ===== power & news package (power grid, electric fences, generators, mechanics, news stories and their consequences) =====
(function (D) {
  D.power = {
    cable: { name: 'Mainland cable', kw: 40, radius: 24, ci: 27.5, cj: 55.5, fee: 20 },     // the cable lands at the gate quay: modest supply, covers a radius around the gate
    classes: [
      { id: 'containment', name: 'Containment', emoji: '🔒', blurb: 'Electric fences and barriers' },
      { id: 'life', name: 'Life support', emoji: '💧', blurb: 'Pumps, boreholes, tanks, hatching and medical' },
      { id: 'research', name: 'Research', emoji: '🔬', blurb: 'Lab, hatchery, sequencing' },
      { id: 'transport', name: 'Transport', emoji: '🚝', blurb: 'Monorail and ferries' },
      { id: 'guest', name: 'Guest services', emoji: '🎡', blurb: 'Shops, food, rides, lights' }
    ],
    // building type -> class (anything not listed uses the def's powerClass, then its type)
    classOf: { research_lab: 'research', hatchery: 'research', pump_station: 'life', borehole: 'life', vet_clinic: 'life', emergency_bunker: 'life', keeper_hut: 'life', monorail_station: 'transport' },
    // kW drawn by buildings and scenery that plausibly use mains power (applied below; other agents set needsPower / powerDraw on their own defs)
    draws: { research_lab: 10, hatchery: 6, restaurant: 6, gift_shop: 2.5, burger_stand: 1.5, pizza_hut: 2, ice_cream: 1.2, drinks_stall: 0.8, coffee_cart: 1, toilets: 0.8, carousel: 4,
      info_kiosk: 0.6, viewing_platform: 0.5, education_centre: 5, vet_clinic: 3, keeper_hut: 1, emergency_bunker: 2, balloon_stand: 0.3, monorail_station: 6, pump_station: 8, borehole: 3.5 },
    sceneryDraws: { lamp: 0.15, fountain: 0.6 },
    fuelPrice: 1.15,        // pounds per kWh from diesel
    shedHours: 1.1,         // game hours of a heavy (>30%) shortfall before the breakers trip
    backupDelay: 0.45,      // game hours before a backup generator auto-starts
    batteryRate: 40,        // kW charge / discharge per battery bank
    mechanic: { repairMul: 0.6, breakMul: 0.55, max: 2, callOut: 140 },
    sabotage: { perFired: 0.004, perHeat: 0.00005 },
    history: 24
  };
  // ---- electric fences: strength is the powered value; unpowered falls to `unpowered`
  D.fences.push(
    { id: 'electric_light', name: 'Electric wire', cost: 55, strength: 4, height: 1.5, seeThrough: true, style: 'electric', electric: true, unpowered: 1, needsPower: true, powerDraw: 0.12,
      info: 'Cheap and see-through. Strong only while the power is on; dead wire is just a wire.' },
    { id: 'electric_heavy', name: 'Electric perimeter fence', cost: 240, strength: 6, height: 3.0, seeThrough: true, style: 'electric', electric: true, unpowered: 2, needsPower: true, powerDraw: 0.3,
      info: 'The strongest land barrier while powered. Without power it is only a tall mesh fence.' }
  );
  // ---- power buildings
  D.buildings.push(
    { id: 'substation', name: 'Substation', emoji: '🔌', cost: 2200, upkeep: 14, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 0, powerNode: { radius: 11 },
      info: 'Hands mains power to everything within 11 tiles. The island is one grid: sources feed every substation.' },
    { id: 'power_pylon', name: 'Power pylon', emoji: '🗼', cost: 750, upkeep: 4, type: 'utility', utility: true, price: 0, capacity: 0, w: 1, h: 1, satisfies: {}, star: 0, powerNode: { radius: 6 },
      info: 'A small relay: hands mains power to everything within 6 tiles.' },
    { id: 'diesel_gen', name: 'Diesel generator', emoji: '🛢️', cost: 3500, upkeep: 24, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 0,
      gen: { kind: 'diesel', kw: 45, noise: 8 }, info: 'Generates up to 45 kW on demand (burns £1.15/kWh of fuel, paid daily). Noisy and ugly: lowers scenery appeal nearby.' },
    { id: 'solar_field', name: 'Solar field', emoji: '☀️', cost: 5200, upkeep: 12, type: 'utility', utility: true, price: 0, capacity: 0, w: 3, h: 3, satisfies: {}, star: 1,
      gen: { kind: 'solar', kw: 38 }, info: 'Generates up to 38 kW of free power by day. Cloud and rain cut output; zero at night. Pair with batteries.' },
    { id: 'wind_turbine', name: 'Wind turbine', emoji: '🌬️', cost: 4300, upkeep: 18, type: 'utility', utility: true, price: 0, capacity: 0, w: 1, h: 1, satisfies: {}, star: 1,
      gen: { kind: 'wind', kw: 26 }, info: 'Generates 26 kW rated (up to ~30 kW in strong wind), fuel-free. Feathers its blades and stops in violent storms.' },
    { id: 'battery_bank', name: 'Battery bank', emoji: '🔋', cost: 3200, upkeep: 10, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 1,
      battery: { kwh: 120 }, info: 'Stores 120 kWh of surplus power (charges and discharges up to 40 kW) and bridges short cuts while backup spins up.' },
    { id: 'backup_gen', name: 'Backup generator', emoji: '⚡', cost: 3900, upkeep: 22, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 1,
      gen: { kind: 'backup', kw: 35, noise: 3 }, info: 'Generates 35 kW during a power cut: auto-starts shortly after an outage for selected classes (Power screen). Burns fuel.' },
    { id: 'geothermal_plant', name: 'Geothermal plant', emoji: '🌋', cost: 36000, upkeep: 140, type: 'utility', utility: true, price: 0, capacity: 0, w: 4, h: 4, satisfies: {}, star: 4,
      gen: { kind: 'geothermal', kw: 120 }, info: 'Generates a steady 120 kW of clean power around the clock, in any weather. High build cost and upkeep.' }
  );
  // existing buildings and scenery that plausibly use mains power
  D.buildings.forEach(function (b) { var kw = D.power.draws[b.id]; if (kw && !b.powerDraw) { b.needsPower = true; b.powerDraw = kw; } });
  D.scenery.forEach(function (s) { var kw = D.power.sceneryDraws[s.id]; if (kw && !s.powerDraw) { s.needsPower = true; s.powerDraw = kw; } });
  D.staff.push({ id: 'mechanic', name: 'Mechanic', emoji: '🔧', 'wage/day': 75, hireCost: 300, effect: 'Keeps generators & pumps running (fewer breakdowns, faster power repairs) and inspects & repairs rollercoasters across reachable paths' });
  D.goals.push({ id: 'power_backup', text: 'Build a backup generator and a battery bank', type: 'powerBackup', target: 1, reward: 2200 });
  D.guestThoughts.blackout = [
    "Why has it gone so dark?", "Is the power off? I can't see the menu!", "No lights, no ice lollies... this is grim.", "Somebody call an electrician!",
    "The rides have stopped!", "I can hear the generators grumbling.", "Spooky in the dark with all these dinosaurs about."
  ];
  D.guestThoughts.protest = ["Who are those people with the placards?", "Do we really want to go past the protesters?", "The protest at the gate was a bit much."];
  D.guestThoughts.thrill = ["I heard about the escape, that is why I came!", "Is that where the big one got out?", "Worth it just for the gossip.", "Any chance of a near miss?"];

  // ---- news: outlets, headline templates. Tokens: {park} {sp} {spp} {name} {n} {amt} {hours} {hybrid} {prey} {price} {days} {award}
  D.news = {
    outlets: [
      { id: 'cycad', name: 'The Daily Cycad', tone: 'tab' }, { id: 'gazette', name: 'Amberside Gazette', tone: 'broad' }, { id: 'courier', name: 'The Fernleaf Courier', tone: 'broad' },
      { id: 'echo', name: 'Island Echo', tone: 'tab' }, { id: 'sauropod', name: 'Evening Sauropod', tone: 'tab' }, { id: 'clarion', name: 'Coastal Clarion', tone: 'broad' },
      { id: 'wobble', name: 'The Weekly Wobble', tone: 'tab' }, { id: 'bugle', name: 'Stegosaur Bugle', tone: 'broad' }
    ],
    // kind -> mood (good|bad|mixed|info), heads, subs
    kinds: {
      escape: { mood: 'bad', head: ['{sp} on the loose at {park}: guests urged to "stay calm and keep walking"', 'RUN, THEN WALK: {name} the {sp} goes for a wander at {park}', 'Fence? What fence? {sp} takes a stroll through {park}', '{park} mislays a {sp}; rangers "confident" it is somewhere'],
        sub: ['Witnesses describe a "very large surprise" near the gift shop.', 'Insurers have been seen sweating.', 'A spokesman said the incident was "entirely under control", from behind a bin.'] },
      escape_injury: { mood: 'bad', head: ['{n} hurt as {sp} runs amok at {park}', 'Teeth, claws and compensation claims at {park}', '"It looked right at me": {sp} attack leaves {park} reeling', 'Day out turns to disaster: {sp} injures {n} at {park}'],
        sub: ['Ambulances queued on the causeway as the island held its breath.', 'Campaigners call the park "an accident waiting to happen". It has now happened.', 'The Health and Safety people are said to be "on the ferry".'] },
      escape_cluster: { mood: 'bad', head: ['Not again! {n} dinosaurs now out at {park}', 'Chaos at {park} as the great escape grows to {n} animals'], sub: ['Staff are reportedly "running out of rope, and sensible things to say".'] },
      recapture: { mood: 'good', head: ['Heroic rangers coax {name} the {sp} back home, nobody hurt', 'Brave {park} team recapture {sp} without a scratch', 'Hero rangers save the day at {park}', 'Safe and sound: {park} staff calm a runaway {sp}'],
        sub: ['Guests applauded as the {sp} was led away looking mildly embarrassed.', '"Textbook," said one onlooker, who had hidden behind a pushchair.'] },
      death: { mood: 'bad', head: ['Farewell, {name}: {park} mourns a much-loved {sp}', 'Sad day at {park} as {name} the {sp} dies', '{park} in mourning: {sp} {name} has died'],
        sub: ['Rangers say {name} "had a lovely life and a great appetite".', 'Flowers have been left at the viewing fence.'] },
      death_neglect: { mood: 'bad', head: ['Questions asked after {sp} dies at {park}', 'Neglect claims as {sp} dies at {park}', '"Was {name} looked after?" Campaigners demand an inquiry at {park}'],
        sub: ['Animal charities say the animal had been "visibly unhappy for days".', 'The park insists it is "doing everything it can". Evidence is thin on the ground.'] },
      predation_view: { mood: 'mixed', head: ['Lunch with a view: guests watch {sp} dine on a neighbour at {park}', 'Nature red in tooth and claw: shock for {n} onlookers at {park}', 'Front-row seats to a feast: {sp} strikes in front of the crowds', 'Gasps at {park} as {sp} makes a kill'],
        sub: ['Children were "fascinated". Parents were "reconsidering the picnic".', 'Thrill-seekers are already booking.'] },
      predation_quiet: { mood: 'info', head: ['{park} predators "just doing what predators do"', 'Circle of life: one {prey} fewer at {park}'], sub: ['Nobody was watching. The {sp} was, apparently, quite pleased.'] },
      birth: { mood: 'good', head: ['It\'s a baby {sp}! {park} welcomes a newborn', 'Cuteness alert: tiny {sp} born at {park}', 'Pitter-patter of tiny claws at {park}'], sub: ['Queues for the viewing fence "stretch to the ferry".', 'Mother and baby are "both doing well, and both unbelievably fluffy".'] },
      hatch: { mood: 'good', head: ['Egg-cellent news: {park} hatches a {sp}', 'Crack! A new {sp} breaks out at {park}', '{name} the {sp} hatches at {park}'], sub: ['"Weighs about as much as a bag of sugar," said a delighted scientist.'] },
      species_first: { mood: 'good', head: ['A first for the island: {park} hatches its very first {sp}', 'Scientists beam as {sp} hatches at {park}', 'History made at {park}: the {sp} walks again'], sub: ['Sponsors are reported to be "circling, in a friendly way".', 'Naturalists called it "a proper, grown-up miracle".'] },
      hybrid: { mood: 'mixed', head: ['Playing God? {park} unveils its {hybrid}', 'Frankenstein\'s paddock? Scientists create the {hybrid}', 'Ethics row as {park} hatches the {hybrid}', 'Half this, half that: the {hybrid} arrives at {park}'],
        sub: ['Grant bodies are intrigued. Protest groups are already printing placards.', '"We have not created a monster," said the park. "Probably."'] },
      power_cut: { mood: 'bad', head: ['Lights out at {park}: {hours}-hour blackout leaves guests in the dark', '"Who turned the lights out?" {park} plunged into darkness', 'Cable cut: {park} fumbles for torches', 'Blackout at {park}: dinosaurs unmoved, guests less so'],
        sub: ['Fridges hummed their last. The ice cream was not saved.', 'Neighbours across the water saw the island go dark "like a switch had been thrown".'] },
      power_backup: { mood: 'good', head: ['Lights flicker, fences hold: {park}\'s backup power works', 'Generators to the rescue at {park}', 'Blackout? What blackout? {park} rides it out'], sub: ['"A boring night," said the head mechanic, delighted.'] },
      sabotage: { mood: 'bad', head: ['Sabotage! Saboteur cuts {park}\'s power: police investigate', 'Foul play at {park}: cables cut in the night', 'Disgruntled? Ex-employee suspected over {park} blackout'], sub: ['Police are "keeping an open mind and a closed padlock".'] },
      mono_stuck: { mood: 'bad', head: ['Stranded in the sky: {n} guests stuck on {park} monorail', 'High and dry: monorail passengers wait for rescue at {park}', 'The long way round: {park} monorail grinds to a halt'], sub: ['Passengers were reportedly "very well behaved, and extremely hungry".'] },
      wildlife_killed: { mood: 'bad', head: ['Wild {sp} killed at {park}: outrage on the island', '{park} accused over death of wild {sp}', 'Wildlife groups furious after {sp} killed at {park}'], sub: ['Local naturalists have promised "a very strongly worded letter, and a march".'] },
      storm_weathered: { mood: 'good', head: ['{park} weathers the storm without a flicker', 'Storm? What storm? {park} shrugs off thunder and lightning', 'Thunder rolls, {park} carries on'], sub: ['Guests gave the park "full marks and a damp handshake".'] },
      award: { mood: 'good', head: ['{park} wins {award}', 'Gold for {park}: {award}', '"{award}": {park} takes the crown'], sub: ['Judges praised "calm staff, contented animals and sensible fences".'] },
      rating: { mood: 'good', head: ['{park} earns {n} stars: "worth the ferry fare", say critics', 'Rising stars: {park} now rated {n}', '{n} stars for {park} and the queue is out of the gate'], sub: ['Reviewers note "an improvement in both dinosaurs and sandwiches".'] },
      record_crowd: { mood: 'good', head: ['Record {n} crowd pours into {park}', 'Queues round the quay as {park} breaks attendance record', 'Standing room only at {park}: {n} visitors'], sub: ['The ferry company has asked for a bigger boat.'] },
      donation: { mood: 'good', head: ['Mystery benefactor gives {amt} to {park}', 'Generous envelope lands at {park}: {amt}', 'Anonymous donor backs {park} with {amt}'], sub: ['The note read: "For the fossils. And the tea."'] },
      inspection_pass: { mood: 'good', head: ['{park} passes inspection with flying colours', 'Spotless: inspectors give {park} the thumbs up'], sub: ['"We found nothing to complain about," said an inspector, sounding disappointed.'] },
      inspection_fail: { mood: 'bad', head: ['{park} fined {amt} after inspection: "must do better"', 'Inspectors slam {park}: {amt} fine'], sub: ['The report ran to eleven pages and one sad drawing.'] },
      high_prices: { mood: 'bad', head: ['Fossil-priced tickets: {park} accused of daylight robbery', '{price} to see a lizard? Visitors balk at {park} prices', 'Cost of a day out at {park} "positively prehistoric"'], sub: ['A family of four were seen eating their sandwiches outside the gate.'] },
      welfare_low: { mood: 'bad', head: ['Unhappy animals at {park}? Campaigners demand answers', 'Gloomy dinosaurs raise alarm at {park}', '"Do something!" Charity slams conditions at {park}'], sub: ['Vets who visited from the mainland described "a lot of sighing".'] },
      welfare_high: { mood: 'good', head: ['Happy, healthy and hugely well cared for: vets praise {park}', 'Contented creatures: {park} praised for animal welfare', '"The happiest dinosaurs in Britain": {park} wins plaudits'], sub: ['One visiting vet admitted to being "slightly jealous".'] },
      quiet: { mood: 'good', head: ['{n} days without an incident: {park} "dull in the best possible way"', 'Not a single scare for {n} days at {park}', 'Safe as houses: {park} marks {n} quiet days'], sub: ['The head ranger reported "nothing to report", and seemed pleased about it.'] },
      closure: { mood: 'bad', head: ['Authorities shut {park} for a day after string of incidents', 'Gates locked at {park}: officials order a day of "reflection"'], sub: ['A sign on the gate said "Back tomorrow". Probably.'] },
      fine: { mood: 'bad', head: ['{park} fined {amt} over safety lapses', 'Hefty {amt} penalty for {park}'], sub: ['The magistrates were "concerned, and slightly out of breath".'] },
      press_tour: { mood: 'good', head: ['Open doors win praise: press tour impressed by {park}', '"Come and see for yourselves": {park} charms the press'], sub: ['Journalists were seen petting a very patient herbivore.'] },
      press_backfire: { mood: 'bad', head: ['Exposé: press tour finds "grim" conditions at {park}', 'Own goal: {park} invites press, regrets it'], sub: ['A photographer captured "a thoroughly miserable-looking {sp}".'] },
      sponsor: { mood: 'good', head: ['Sponsor signs up with {park}: {amt} on the table', 'Cash for creatures: {park} lands a sponsor'], sub: ['The sponsor would "like to be associated with something with teeth".'] },
      grant: { mood: 'good', head: ['Scientists back {park} with {amt} grant', 'Research council opens the purse for {park}'], sub: ['"Frankly, we want to see what happens next," said one academic.'] }
    }
  };
})(window.Z.DATA);

// ===== realms package (marine tanks and sea pens, the Thunder Dome aviary, virtual tagged enclosures, viewing structures) =====
(function (D) {
  // special fence types: sea nets (style 'net'). Hidden from the land Fences tab (special:true), sold in the Marine tab.
  D.fences.push(
    { id: 'sea_net', name: 'Sea net', cost: 30, strength: 2, height: 1.6, seeThrough: true, style: 'net', special: true, realm: 'sea', blurb: 'Knotted rope net on floats. Holds small and gentle swimmers.' },
    { id: 'steel_sea_mesh', name: 'Steel sea mesh', cost: 70, strength: 4, height: 1.8, seeThrough: true, style: 'net', special: true, realm: 'sea', blurb: 'Galvanised steel mesh on heavy buoys.' },
    { id: 'armoured_sea_barrier', name: 'Armoured sea barrier', cost: 130, strength: 5, height: 2.0, seeThrough: true, style: 'net', special: true, realm: 'sea', blurb: 'Cabled steel barrier. The only thing that holds a Mosasaurus.' }
  );
  // special path types: guest-safe viewing walks through or over the animals' habitat (placed by the Realms tools, never from the Paths tab)
  D.paths.push(
    { id: 'acrylic_tunnel', name: 'Acrylic tunnel', cost: 95, colour: '#9fd4e6', speed: 1.0, special: true, walk: 'tunnel', blurb: 'A transparent tube that guests walk through, under the water.' },
    { id: 'mesh_walk', name: 'Mesh walk-through', cost: 55, colour: '#9aa3a8', speed: 1.0, special: true, walk: 'mesh', blurb: 'A mesh-covered walkway that crosses the aviary.' },
    { id: 'glass_pier', name: 'Glass-bottom pier', cost: 50, colour: '#b9dde8', speed: 1.0, special: true, walk: 'pier', blurb: 'A floating walkway with glass panels over the water.' },
    { id: 'skywalk', name: 'Armoured skywalk', cost: 120, colour: '#aeb7bd', speed: 1.0, special: true, walk: 'sky', blurb: 'An armoured glass tunnel through a virtual zone.' }
  );
  D.realms = {
    tank: {
      levels: [
        { id: 1, name: 'Shallow tank', depth: 1.6, cost: 90, label: '2.5 m' },
        { id: 2, name: 'Deep tank', depth: 2.8, cost: 150, label: '4.5 m' },
        { id: 3, name: 'Abyss tank', depth: 4.4, cost: 240, label: '7 m' }
      ],
      walls: [
        { id: 1, name: 'Acrylic wall', strength: 3, cost: 40 },
        { id: 2, name: 'Laminated acrylic', strength: 4, cost: 80 },
        { id: 3, name: 'Reinforced acrylic', strength: 5, cost: 140 }
      ],
      maxTiles: 220, sinkK: 0.42, upkeepTile: 3
    },
    pen: { maxTiles: 420, upkeepTile: 1 },
    dome: {
      heights: [
        { id: 1, name: 'Low dome', h: 4.0, cost: 55, label: '10 m' },
        { id: 2, name: 'Standard dome', h: 7.0, cost: 80, label: '18 m' },
        { id: 3, name: 'Grand dome', h: 10.0, cost: 115, label: '28 m' }
      ],
      meshes: [
        { id: 1, name: 'Light mesh', strength: 2, mult: 1.0 },
        { id: 2, name: 'Steel mesh', strength: 3, mult: 1.35 },
        { id: 3, name: 'Reinforced mesh', strength: 4, mult: 1.85 }
      ],
      maxTiles: 380, upkeepTile: 2
    },
    virtual: {
      tileCost: { land: 140, sea: 160, sky: 120 }, maxTiles: 360, upkeepTile: 6, tagUpkeep: 6,
      bands: [
        { id: 1, name: 'Low airspace', h0: 0, h1: 4.5, mul: 1.0, label: 'to 12 m' },
        { id: 2, name: 'Mid airspace', h0: 0, h1: 8.0, mul: 1.5, label: 'to 22 m' },
        { id: 3, name: 'High airspace', h0: 0, h1: 12.0, mul: 2.1, label: 'to 35 m' }
      ],
      towers: [
        { lvl: 1, radius: 10, capacity: 6, strength: 3, upgrade: 0 },
        { lvl: 2, radius: 14, capacity: 12, strength: 4, upgrade: 18000 },
        { lvl: 3, radius: 19, capacity: 24, strength: 5, upgrade: 32000 }
      ],
      tagBase: 300, tagK: 0.06
    },
    plant: { radius: 9, capacity: 900 },
    // per-species notes the sim derives defaults from (see 26-sim-realms.js speciesNeeds). depth = water depth wanted (world units), fresh = tolerates fresh water,
    // live = live birth (no egg), minFence override for the aviary, tagResist override.
    species: {
      ichthyosaurus: { depth: 0.6, live: true, school: true },
      archelon: { depth: 0.7, live: false },
      elasmosaurus: { depth: 1.0, live: true },
      liopleurodon: { depth: 1.0, live: true },
      mosasaurus: { depth: 1.2, live: true, breach: true },
      dolphin: { depth: 0.9, live: true, breach: true },
      seal: { depth: 0.5, live: true, haul: true },
      fish_shoal: { depth: 0.4, fresh: true, school: true },
      dimorphodon: { needH: 2.5 }, rhamphorhynchus: { needH: 3.0 }, pteranodon: { needH: 4.5 }, quetzalcoatlus: { needH: 7.5, minFence: 4 }, seagull: { needH: 2.5 }, heron: { needH: 3.0 }
    }
  };
  D.buildings.push(
    { id: 'filtration_plant', name: 'Tank filtration plant', emoji: '🧪', cost: 7500, upkeep: 70, type: 'utility', utility: true, price: 0, capacity: 0, w: 3, h: 2, satisfies: {}, star: 2, needsPower: true, powerDraw: 18, powerClass: 'life', realm: 'plant',
      info: 'Supplies and filters up to 900 units of sea water for lagoon tanks within 9 tiles (draws 18 kW). Without power the water goes stale.' },
    { id: 'underwater_gallery', name: 'Underwater gallery', emoji: '🪟', cost: 9000, upkeep: 60, type: 'info', price: 0, capacity: 24, w: 3, h: 2, satisfies: { fun: 0.5 }, star: 2, plat: true, realm: 'gallery',
      info: 'Viewing hall with floor-to-ceiling acrylic windows set into a tank wall (capacity 24, +50% fun). Build touching a tank with a path at the entrance.' },
    { id: 'feeding_grandstand', name: 'Feeding-show grandstand', emoji: '🎪', cost: 12500, upkeep: 90, type: 'info', price: 0, capacity: 60, w: 4, h: 2, satisfies: { fun: 0.6 }, star: 3, plat: true, realm: 'grandstand',
      info: 'Tiered seating beside a tank or sea pen (capacity 60, +60% fun). Rangers run feeding shows twice a day, boosting mood and spending.' },
    { id: 'canopy_tower', name: 'Canopy observation tower', emoji: '🗼', cost: 8500, upkeep: 55, type: 'info', price: 0, capacity: 16, w: 2, h: 2, satisfies: { fun: 0.4 }, star: 3, plat: true, realm: 'tower',
      info: 'Tall lookout beside the Thunder Dome (capacity 16, +40% fun). Guests watch pterosaurs soar at eye level.' },
    { id: 'tagging_tower', name: 'Tagging control tower', emoji: '📡', cost: 26000, upkeep: 140, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 3, needsPower: true, powerDraw: 25, powerClass: 'containment', realm: 'tower',
      info: 'Projects an invisible geofence (10-tile range, 6 tags, strength 3 at level 1; upgradable). Draws 25 kW; power loss drops the fence.' },
    { id: 'boathouse', name: 'Recovery boathouse', emoji: '🚤', cost: 6000, upkeep: 45, type: 'utility', utility: true, price: 0, capacity: 0, w: 3, h: 2, satisfies: {}, star: 2, realm: 'boat',
      info: 'Keeps a rescue boat and divers. Escaped marine animals are recovered much faster. Build near the shore.' },
    { id: 'drone_hangar', name: 'Net-gun drone hangar', emoji: '🛸', cost: 7000, upkeep: 55, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 3, realm: 'drone',
      info: 'Launches net-gun drones. Escaped flying animals are recovered much faster.' }
  );
  D.scenery.push(
    { id: 'kelp_bed', name: 'Kelp bed', emoji: '🌿', cost: 120, kind: 'deco', biome: 'water', aesthetic: 2, inEnclosure: true, aquatic: true, marine: 'kelp', info: 'Swaying kelp for tanks and sea pens. Enrichment for every marine animal (one per 10 water tiles).' },
    { id: 'reef_block', name: 'Reef block', emoji: '🪸', cost: 260, kind: 'deco', biome: 'water', aesthetic: 3, inEnclosure: true, aquatic: true, marine: 'reef', info: 'Coral-covered blocks that give fish and reptiles somewhere to hide. Enrichment (one per 14 water tiles).' },
    { id: 'fish_feeder', name: 'Fish feeder', emoji: '🐟', cost: 450, kind: 'toy', biome: 'water', aesthetic: 1, inEnclosure: true, aquatic: true, marine: 'feeder', info: 'A floating feeder that drops fish on the hour. Piscivores and predators in tanks and pens need one.' },
    { id: 'perch_crag', name: 'Perch crag', emoji: '🪨', cost: 160, kind: 'rock', biome: 'rock', aesthetic: 2, inEnclosure: true, air: 'perch', info: 'A craggy outcrop with a flat top. Pterosaurs land and perch on it; counts as rocks and perches in the Thunder Dome.' },
    { id: 'perch_pole', name: 'Perch pole', emoji: '🪵', cost: 90, kind: 'deco', biome: 'any', aesthetic: 1, inEnclosure: true, air: 'perch', info: 'A stout pole with a crossbar for resting. Counts as a perch in the Thunder Dome.' },
    { id: 'fish_pool', name: 'Fish pool', emoji: '🐠', cost: 380, kind: 'toy', biome: 'water', aesthetic: 2, inEnclosure: true, air: 'pool', info: 'A small stocked pool. Fish-eating fliers dive into it; counts as water and a fish supply in the Thunder Dome.' }
  );
  D.goals.push(
    { id: 'realm_marine', text: 'Keep your first marine reptile in a tank or sea pen', type: 'realm', what: 'marine', target: 1, reward: 4000 },
    { id: 'realm_ptero', text: 'Fly your first pterosaur in the Thunder Dome', type: 'realm', what: 'ptero', target: 1, reward: 5000 },
    { id: 'realm_tunnel', text: 'Send 500 guests through a transparent tunnel', type: 'realm', what: 'tunnel', target: 500, reward: 6000 },
    { id: 'realm_virtual', text: 'Hold 5 animals in a virtual enclosure for 5 days with no escapes', type: 'realm', what: 'virtual', target: 5, reward: 9000 }
  );
  D.guestThoughts.tunnel = [
    "I'm walking under the sea!", "A {animal} just swam right over my head!", "This tunnel is amazing, look at the {animal}.", "I could touch the {animal} through the glass.",
    "The light through the water is beautiful.", "Mind the {animal}... it is looking at me!"
  ];
  D.guestThoughts.gallery = [
    "Floor-to-ceiling windows on the {animal}, lovely.", "The {animal} came right up to the glass!", "I could stay here all day watching the {animal}."
  ];
  D.guestThoughts.show = [
    "That feeding show was brilliant!", "I got soaked, and loved it.", "Did you see the {animal} leap?", "The ranger made the {animal} look so clever."
  ];
  D.guestThoughts.aviary = [
    "Look at the wingspan on that {animal}!", "The {animal} just swooped over the mesh.", "I never thought I would see a {animal} fly.", "Is that mesh strong enough? The {animal} is huge."
  ];
  D.guestThoughts.virtual = [
    "No fences at all, just the {animal} in the open!", "Perfect view of the {animal}. Wait, is that safe?", "The tag on the {animal} is blinking.", "The {animal} is so close to the invisible line."
  ];
})(window.Z.DATA);

// ===== safari package (open-range zones, trucks and boats, wildlife from the mainland) =====  See notes/safari.md
(function (D) {
  D.safari = {
    trackCost: 5, waterTrackCost: 7, refund: 0.5,            // per route tile (dirt track) / per buoyed tile at sea; removal refunds 50%
    truckCost: 7500, boatCost: 6200, balloonCost: 9800, upkeep: { land: 24, sea: 20, air: 26 }, refundVeh: 0.6,
    capacity: { land: 8, sea: 10, air: 6 }, maxVeh: 4,   // seats, vehicles per depot / harbour
    speed: { land: 3.0, sea: 3.4, air: 1.6 }, accel: 1.8, dwell: 6,   // units per second
    fare: 6, fareMax: 25, fareRef: 6,
    minZone: 36, minInside: 7, viewR: 15, closeR: 5,         // smallest zone (tiles), tiles of route inside the zone, view radius / close-encounter radius (world units)
    gateTime: 1.6, nudgeChance: 0.0012, strandHours: 2.2, injuryChance: 0.00045,
    breakdownPerHour: 0.01, fixTime: [20, 60],
    wild: { cap: { land: 7, sea: 4, air: 5 }, perHour: 1.1, stayHours: [5, 14], pingerMul: 0.3, scareMul: 0.35, fearR: 9, corridorFee: 0, pingerUp: 4, scareUp: 3 },
    escape: { shutterSec: 140, lockdownCost: 600, rangerBonus: 0.6, reconCost: 6500, reconDays: 3, finePer: 1800, closeDays: 2, mainlandLossRep: 12 }
  };
  D.buildings.push(
    { id: 'safari_depot', name: 'Safari depot', emoji: '🛻', cost: 9000, upkeep: 40, type: 'transport', price: 0, capacity: 0, w: 3, h: 2, satisfies: {}, star: 3, safari: 'land',
      info: 'Garage, ticket hall and boarding bay for armoured safari trucks. Entrance must touch a path. Draw a safari track from the bay through a zone, then buy trucks.' },
    { id: 'safari_harbour', name: 'Safari harbour', emoji: '⛵', cost: 8000, upkeep: 36, type: 'transport', price: 0, capacity: 0, w: 3, h: 2, satisfies: {}, star: 3, safari: 'sea',
      info: 'A boarding jetty with a boathouse for glass-bottom tour boats. Build on the shore with a path at the entrance, then draw a buoyed route out through a sea zone.' },
    { id: 'safari_balloon', name: 'Balloon pad', emoji: '🎈', cost: 7000, upkeep: 30, type: 'transport', price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 4, safari: 'air',
      info: 'Tethered viewing balloons that drift over a sky zone or a Thunder Dome on a drawn flight route. Entrance must touch a path.' },
    { id: 'safari_portal', name: 'Geofence portal', emoji: '🚧', cost: 4500, upkeep: 22, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 1, satisfies: {}, star: 3, needsPower: true, powerDraw: 0.15, powerClass: 'life', safariPortal: true,
      info: 'Cattle grid, bollards and a boom barrier at the edge of a virtual zone. Vehicles cross here; the boom locks shut if the power fails.' },
    { id: 'ranger_post', name: 'Ranger post', emoji: '🏕️', cost: 5500, upkeep: 50, type: 'utility', utility: true, price: 0, capacity: 0, w: 2, h: 2, satisfies: {}, star: 3, safariRanger: true,
      info: 'Rangers with a jeep and a hailer. They haze wildlife, tow stranded safari vehicles and cut recapture time on the mainland side.' }
  );
  D.fences.push(
    { id: 'safari_gate', name: 'Safari airlock gate', cost: 5500, strength: 6, height: 2.6, seeThrough: true, style: 'gate', special: true, safariGate: 'land',
      blurb: 'Twin doors on a chamber that never open together. Place on a fence edge the safari track crosses. Locks shut if the power fails.' },
    { id: 'safari_boat_gate', name: 'Boat lock gate', cost: 5000, strength: 5, height: 2.0, seeThrough: true, style: 'gate', special: true, safariGate: 'sea',
      blurb: 'A boom-and-net lock in a sea pen barrier for tour boats. Locks shut if the power fails.' }
  );
  D.scenery.push(
    { id: 'wildlife_corridor', name: 'Wildlife corridor', emoji: '🦌', cost: 900, kind: 'deco', biome: 'any', aesthetic: 1, inEnclosure: true, safariCorridor: true, info: 'A one-way wildlife gap with emergency shutters. Lets deer, seals and gulls wander into a fenced zone. Open or close it in the zone panel.' },
    { id: 'scarecrow', name: 'Hazing scarecrow', emoji: '🧍', cost: 320, kind: 'deco', biome: 'any', aesthetic: 0, inEnclosure: true, safariDeter: 'land', info: 'Keeps wild deer, boar and rabbits from wandering into the zone nearby.' },
    { id: 'acoustic_pinger', name: 'Acoustic pinger', emoji: '🔔', cost: 520, kind: 'deco', biome: 'water', aesthetic: 0, inEnclosure: true, aquatic: true, safariDeter: 'sea', info: 'An underwater pinger that keeps seals, dolphins and fish shoals away from the zone.' },
    { id: 'bird_scarer', name: 'Bird scarer', emoji: '📢', cost: 380, kind: 'deco', biome: 'any', aesthetic: 0, inEnclosure: true, safariDeter: 'air', info: 'A gas-gun scarer that keeps gulls and herons out of a sky zone.' }
  );
  D.goals.push(
    { id: 'safari_first', text: 'Carry your first safari passengers', type: 'safari', what: 'rides', target: 1, reward: 3500 },
    { id: 'safari_300', text: 'Carry 300 safari passengers', type: 'safari', what: 'rides', target: 300, reward: 8000 },
    { id: 'safari_sea', text: 'Run a boat safari through a sea zone', type: 'safari', what: 'sea', target: 1, reward: 6000 },
    { id: 'safari_week', text: 'Keep a connected safari zone for 7 days with no escapes', type: 'safari', what: 'week', target: 7, reward: 9000 }
  );
  D.guestThoughts.safari = [
    "A real safari, right here on the island!", "No fences between us and the {animal}!", "The truck rattles over the dirt, I love it.", "Look, a {animal} by the track!",
    "Best ticket in the park.", "The {animal} just walked straight past the window."
  ];
  D.guestThoughts.safariDanger = [
    "That {animal} is looking right at the truck!", "Is the cage strong enough for a {animal}?", "I can see its teeth. Through the bars. Wow.", "The {animal} is bigger than the truck!"
  ];
  D.guestThoughts.safariFeed = ["I fed a {animal} from the window!", "It took the carrot right out of my hand.", "The {animal} is so gentle.", "My kids will not believe this."];
  D.guestThoughts.safariStuck = ["Why have we stopped out here?", "I do not like being stuck with a {animal} nearby.", "How long until the rangers come?", "The gates have locked with us inside!", "Someone do something!"];
  D.guestThoughts.safariQueue = ["When is the next truck?", "The safari queue is long.", "Worth the wait, I hope."];
  D.guestThoughts.safariKill = ["I saw a hunt! Incredible!", "It caught a {animal} right in front of us.", "Nature is brutal, and brilliant.", "That was better than any film."];
  D.guestThoughts.safariKillSad = ["Poor {animal}...", "I cannot watch this.", "Take me away from here, the children are crying.", "Why do they let that happen?"];
  D.guestThoughts.safariWild = ["Wild {animal} came in from the mainland!", "A wild {animal} in the zone, how lovely.", "Look, a {animal} just wandered in."];
  D.news.kinds.safari_open = { mood: 'good', head: ['Safari opens at {park}: trucks roll into the open range', '{park} unveils its safari: "no bars between you and the beasts"'], sub: ['The first passengers called it "the best seat on the island".'] };
  D.news.kinds.safari_doc = { mood: 'good', head: ['Nature documentary: {sp} hunt filmed from a {park} safari truck', 'Red in tooth and claw: {park} safari guests witness a hunt', 'Wild encounter at {park}: a {sp} falls to a predator'], sub: ['Visitors said it was "better than the telly".', 'A passing crew filmed the whole thing from the truck.'] };
  D.news.kinds.safari_protest = { mood: 'bad', head: ['Animal welfare groups protest {park}: "safari or slaughterhouse?"', 'Hunts in full view: {park} accused of staging kills for tourists'], sub: ['Campaigners say the wildlife corridor is a trap.'] };
  D.news.kinds.safari_fine = { mood: 'bad', head: ['Conservation fine for {park}: protected {sp} taken once too often', '{park} fined after protected {sp} killed in the safari zone'], sub: ['Regulators asked the park to close the corridor or fit deterrents.'] };
  D.news.kinds.safari_nudge = { mood: 'good', head: ['Cheeky {sp} nudges a safari truck at {park}: video goes viral', 'Truck vs {sp}: {park} safari clip racks up millions of views'], sub: ['The passengers were fine, and very excited.'] };
  D.news.kinds.safari_stuck = { mood: 'bad', head: ['Trapped on safari: {n} guests stranded in the zone at {park}', 'Gates lock with trucks inside: {park} safari passengers wait for rescue'], sub: ['Rangers are said to have arrived "eventually".'] };
  D.news.kinds.mainland = { mood: 'bad', head: ['MAINLAND SIGHTING: {sp} from {park} seen beyond the island', 'Dinosaur on the causeway! {park} animal reaches the mainland', 'Panic ashore as {sp} escapes {park}'], sub: ['Police have closed the coast road and the army has been put on standby.', 'Residents were told to stay indoors.'] };
  D.news.kinds.mainland_recovered = { mood: 'good', head: ['Mainland scare over: {sp} back in {park}', 'Recapture expedition brings {sp} home to {park}'], sub: ['The coast road has reopened.'] };
  D.news.kinds.mainland_lost = { mood: 'bad', head: ['{sp} still at large: {park} gives up the search', 'Gone for good: {park} loses its {sp} to the wild'], sub: ['The authorities were not amused.'] };
  D.news.kinds.safari_wild = { mood: 'info', head: ['Wild visitors at {park}: {sp} wander into the safari'], sub: ['Rangers say the visitors are welcome, as long as the predators are fed.'] };
  // wild donors: DNA from a wild animal found dead / caught near the lab
  D.donors.push(
    { id: 'deer', name: 'Red deer', emoji: '🦌', price: 1400, star: 0, realm: 'land', gene: 'deer_legs', blurb: 'Long running legs and a crown of antlers, from a wild stag sampled in the safari zone.' },
    { id: 'seal', name: 'Grey seal', emoji: '🦭', price: 1600, star: 1, realm: 'sea', gene: 'seal_blubber', blurb: 'Blubber and a sturdy constitution, from a wild seal sampled in the sea zone.' },
    { id: 'seagull', name: 'Seagull', emoji: '🐦', price: 1200, star: 0, realm: 'air', gene: 'gull_hardy', blurb: 'Eats anything and survives anything, from a gull sampled over the zone.' }
  );
  [
    { id: 'deer_legs', name: 'Stag legs and antlers', emoji: '🦌', cost: 5400, donor: 'deer', effect: 'Longer legs and a crest of antlers: quicker and prettier.', fx: { speed: 1.12, appeal: 0.1, upkeep: 1.05 }, look: { crest: 1 } },
    { id: 'seal_blubber', name: 'Seal blubber', emoji: '🦭', cost: 5800, donor: 'seal', effect: 'Sturdier health and amphibious habits.', fx: { sick: 0.85, life: 1.1, swim: 1 }, look: { tint: [0.85, 0.9, 0.95] } },
    { id: 'gull_hardy', name: 'Scavenger constitution', emoji: '🐦', cost: 4600, donor: 'seagull', effect: 'Eats anything: cheaper to keep and rarely ill.', fx: { sick: 0.75, upkeep: 0.9, q: 6 }, look: { tint: [1.15, 1.15, 1.15] } }
  ].forEach(function (g) { D.traits.push(g); });
})(window.Z.DATA);
