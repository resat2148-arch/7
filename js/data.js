// Game data: items, recipes, buildings, milestones, space elevator phases.
// Recipe ratios follow Satisfactory's (per-craft inputs/outputs and craft times).
'use strict';

const n = (en, tr) => ({ en, tr });

// value = resource sink points per item
const ITEMS = {
  iron_ore:       { name: n('Iron Ore', 'Demir Cevheri'), shape: 'ore', color: '#9a6f5e', c2: '#c0704f', value: 1 },
  copper_ore:     { name: n('Copper Ore', 'Bakır Cevheri'), shape: 'ore', color: '#c8743c', c2: '#4fb39a', value: 3 },
  limestone:      { name: n('Limestone', 'Kireçtaşı'), shape: 'ore', color: '#d8cfb4', c2: '#b3a888', value: 2 },
  coal:           { name: n('Coal', 'Kömür'), shape: 'ore', color: '#2d2d33', c2: '#55555f', value: 3 },
  caterium_ore:   { name: n('Caterium Ore', 'Katerium Cevheri'), shape: 'ore', color: '#e2b93b', c2: '#fff0a0', value: 7 },
  crude_oil:      { name: n('Crude Oil', 'Ham Petrol'), shape: 'barrel', color: '#2a1f35', c2: '#8b5fc7', value: 5 },
  leaves:         { name: n('Leaves', 'Yaprak'), shape: 'leaf', color: '#5dbb4f', value: 1 },
  wood:           { name: n('Wood', 'Odun'), shape: 'wood', color: '#8b5a2b', value: 2 },
  iron_ingot:     { name: n('Iron Ingot', 'Demir Külçe'), shape: 'ingot', color: '#a9b1ba', value: 2 },
  copper_ingot:   { name: n('Copper Ingot', 'Bakır Külçe'), shape: 'ingot', color: '#e0874a', value: 6 },
  caterium_ingot: { name: n('Caterium Ingot', 'Katerium Külçe'), shape: 'ingot', color: '#f0cf4a', value: 42 },
  steel_ingot:    { name: n('Steel Ingot', 'Çelik Külçe'), shape: 'ingot', color: '#5d6b78', value: 8 },
  iron_plate:     { name: n('Iron Plate', 'Demir Levha'), shape: 'plate', color: '#b8c0c8', value: 6 },
  iron_rod:       { name: n('Iron Rod', 'Demir Çubuk'), shape: 'rod', color: '#9aa3ad', value: 4 },
  screw:          { name: n('Screw', 'Vida'), shape: 'screw', color: '#c9ced4', value: 2 },
  wire:           { name: n('Wire', 'Tel'), shape: 'wire', color: '#e08a4a', value: 6 },
  cable:          { name: n('Cable', 'Kablo'), shape: 'cable', color: '#e08a4a', c2: '#2e333b', value: 24 },
  concrete:       { name: n('Concrete', 'Beton'), shape: 'block', color: '#bdb8ac', value: 12 },
  copper_sheet:   { name: n('Copper Sheet', 'Bakır Levha'), shape: 'sheet', color: '#e58b52', value: 24 },
  biomass:        { name: n('Biomass', 'Biyokütle'), shape: 'block', color: '#6fbf4a', value: 12 },
  quickwire:      { name: n('Quickwire', 'Hızlı Tel'), shape: 'wire', color: '#f3d25a', value: 17 },
  rip:            { name: n('Reinforced Iron Plate', 'Güçlendirilmiş Demir Levha'), shape: 'rip', color: '#9fa9b3', value: 120 },
  rotor:          { name: n('Rotor', 'Rotor'), shape: 'rotor', color: '#aab3bd', c2: '#ff9a3c', value: 140 },
  modular_frame:  { name: n('Modular Frame', 'Modüler Çerçeve'), shape: 'frame', color: '#b0b8c1', value: 408 },
  smart_plating:  { name: n('Smart Plating', 'Akıllı Kaplama'), shape: 'smart', color: '#9fa9b3', c2: '#4fb3ff', value: 520 },
  steel_beam:     { name: n('Steel Beam', 'Çelik Kiriş'), shape: 'beam', color: '#5d6b78', value: 64 },
  steel_pipe:     { name: n('Steel Pipe', 'Çelik Boru'), shape: 'pipe', color: '#6c7a88', value: 24 },
  eib:            { name: n('Encased Industrial Beam', 'Kaplamalı Endüstriyel Kiriş'), shape: 'eib', color: '#bdb8ac', c2: '#5d6b78', value: 528 },
  stator:         { name: n('Stator', 'Stator'), shape: 'stator', color: '#6c7a88', c2: '#e08a4a', value: 240 },
  motor:          { name: n('Motor', 'Motor'), shape: 'motor', color: '#ff9a3c', c2: '#5d6b78', value: 1520 },
  vf:             { name: n('Versatile Framework', 'Çok Yönlü Çatı'), shape: 'vf', color: '#5d6b78', c2: '#ff9a3c', value: 1176 },
  aw:             { name: n('Automated Wiring', 'Otomatik Kablolama'), shape: 'aw', color: '#e08a4a', c2: '#2e333b', value: 1440 },
  plastic:        { name: n('Plastic', 'Plastik'), shape: 'sheet', color: '#6fb8ff', value: 75 },
  rubber:         { name: n('Rubber', 'Kauçuk'), shape: 'rubber', color: '#3a3a42', value: 60 },
  fuel:           { name: n('Fuel', 'Yakıt'), shape: 'barrel', color: '#e2742b', c2: '#ffcf6a', value: 75 },
  circuit_board:  { name: n('Circuit Board', 'Devre Kartı'), shape: 'circuit', color: '#2f9e5b', c2: '#f3d25a', value: 696 },
  computer:       { name: n('Computer', 'Bilgisayar'), shape: 'computer', color: '#5d6b78', c2: '#4fb3ff', value: 17260 },
  hmf:            { name: n('Heavy Modular Frame', 'Ağır Modüler Çerçeve'), shape: 'hmf', color: '#6c7a88', c2: '#ff9a3c', value: 10800 },
  modular_engine: { name: n('Modular Engine', 'Modüler Motor'), shape: 'engine', color: '#ff9a3c', c2: '#4fb3ff', value: 9960 },
  acu:            { name: n('Adaptive Control Unit', 'Uyarlanabilir Kontrol Ünitesi'), shape: 'acu', color: '#2f9e5b', c2: '#ff5ad1', value: 76368 },
  ai_limiter:     { name: n('AI Limiter', 'YZ Sınırlayıcı'), shape: 'chip', color: '#e58b52', c2: '#f3d25a', value: 920 },
  hsc:            { name: n('High-Speed Connector', 'Yüksek Hızlı Konektör'), shape: 'hsc', color: '#f3d25a', c2: '#5d6b78', value: 3776 },
  supercomputer:  { name: n('Supercomputer', 'Süper Bilgisayar'), shape: 'super', color: '#2e333b', c2: '#ff5ad1', value: 97352 },
  // Consumer electronics branch
  glass:          { name: n('Glass', 'Cam'), shape: 'glass', color: '#9fe3ff', value: 30 },
  battery:        { name: n('Battery', 'Pil'), shape: 'battery', color: '#5ad17a', c2: '#2e333b', value: 400 },
  speaker:        { name: n('Speaker', 'Hoparlör'), shape: 'speaker', color: '#2e333b', c2: '#9aa3ad', value: 350 },
  display:        { name: n('Display Panel', 'Ekran Paneli'), shape: 'display', color: '#2e333b', c2: '#4fb3ff', value: 1500 },
  microchip:      { name: n('Microchip', 'Mikroçip'), shape: 'chip', color: '#4fb3ff', c2: '#d9dde2', value: 700 },
  camera_module:  { name: n('Camera Module', 'Kamera Modülü'), shape: 'camera', color: '#2e333b', c2: '#9fe3ff', value: 2200 },
  television:     { name: n('Television', 'Televizyon'), shape: 'tv', color: '#2e333b', c2: '#4fb3ff', value: 12000 },
  smartphone:     { name: n('Smartphone', 'Akıllı Telefon'), shape: 'phone', color: '#1b1f25', c2: '#7fd4ff', value: 25000 },
  laptop:         { name: n('Laptop', 'Dizüstü Bilgisayar'), shape: 'laptop', color: '#9aa3ad', c2: '#4fb3ff', value: 40000 },
  game_console:   { name: n('Game Console', 'Oyun Konsolu'), shape: 'console', color: '#e8ecf1', c2: '#ff5ad1', value: 22000 },
};

// machine: which building crafts it. hand: can be hand-crafted. alt: alternate recipe (hard drive)
const RECIPES = {
  // Smelter
  iron_ingot:     { m: 'smelter', in: { iron_ore: 1 }, out: { iron_ingot: 1 }, t: 2 },
  copper_ingot:   { m: 'smelter', in: { copper_ore: 1 }, out: { copper_ingot: 1 }, t: 2 },
  caterium_ingot: { m: 'smelter', in: { caterium_ore: 3 }, out: { caterium_ingot: 1 }, t: 4 },
  // Constructor
  iron_plate:     { m: 'constructor', in: { iron_ingot: 3 }, out: { iron_plate: 2 }, t: 6, hand: true },
  iron_rod:       { m: 'constructor', in: { iron_ingot: 1 }, out: { iron_rod: 1 }, t: 4, hand: true },
  screw:          { m: 'constructor', in: { iron_rod: 1 }, out: { screw: 4 }, t: 6, hand: true },
  wire:           { m: 'constructor', in: { copper_ingot: 1 }, out: { wire: 2 }, t: 4, hand: true },
  cable:          { m: 'constructor', in: { wire: 2 }, out: { cable: 1 }, t: 2, hand: true },
  concrete:       { m: 'constructor', in: { limestone: 3 }, out: { concrete: 1 }, t: 4, hand: true },
  copper_sheet:   { m: 'constructor', in: { copper_ingot: 2 }, out: { copper_sheet: 1 }, t: 6, hand: true },
  biomass_leaves: { name: n('Biomass (Leaves)', 'Biyokütle (Yaprak)'), m: 'constructor', in: { leaves: 10 }, out: { biomass: 5 }, t: 5, hand: true },
  biomass_wood:   { name: n('Biomass (Wood)', 'Biyokütle (Odun)'), m: 'constructor', in: { wood: 4 }, out: { biomass: 20 }, t: 4, hand: true },
  steel_beam:     { m: 'constructor', in: { steel_ingot: 4 }, out: { steel_beam: 1 }, t: 4, hand: true },
  steel_pipe:     { m: 'constructor', in: { steel_ingot: 3 }, out: { steel_pipe: 2 }, t: 6, hand: true },
  quickwire:      { m: 'constructor', in: { caterium_ingot: 1 }, out: { quickwire: 5 }, t: 5, hand: true },
  // Assembler
  rip:            { m: 'assembler', in: { iron_plate: 6, screw: 12 }, out: { rip: 1 }, t: 12, hand: true },
  rotor:          { m: 'assembler', in: { iron_rod: 5, screw: 25 }, out: { rotor: 1 }, t: 15, hand: true },
  modular_frame:  { m: 'assembler', in: { rip: 3, iron_rod: 12 }, out: { modular_frame: 2 }, t: 60, hand: true },
  smart_plating:  { m: 'assembler', in: { rip: 1, rotor: 1 }, out: { smart_plating: 1 }, t: 30, hand: true },
  eib:            { m: 'assembler', in: { steel_beam: 3, concrete: 6 }, out: { eib: 1 }, t: 10, hand: true },
  stator:         { m: 'assembler', in: { steel_pipe: 3, wire: 8 }, out: { stator: 1 }, t: 12, hand: true },
  motor:          { m: 'assembler', in: { rotor: 2, stator: 2 }, out: { motor: 1 }, t: 12, hand: true },
  vf:             { m: 'assembler', in: { modular_frame: 1, steel_beam: 12 }, out: { vf: 2 }, t: 24 },
  aw:             { m: 'assembler', in: { stator: 1, cable: 20 }, out: { aw: 1 }, t: 24 },
  circuit_board:  { m: 'assembler', in: { copper_sheet: 2, plastic: 4 }, out: { circuit_board: 1 }, t: 8, hand: true },
  ai_limiter:     { m: 'assembler', in: { copper_sheet: 5, quickwire: 20 }, out: { ai_limiter: 1 }, t: 12 },
  // Foundry
  steel_ingot:    { m: 'foundry', in: { iron_ore: 3, coal: 3 }, out: { steel_ingot: 3 }, t: 4 },
  // Refinery
  plastic:        { m: 'refinery', in: { crude_oil: 3 }, out: { plastic: 2 }, t: 6 },
  rubber:         { m: 'refinery', in: { crude_oil: 3 }, out: { rubber: 2 }, t: 6 },
  fuel:           { m: 'refinery', in: { crude_oil: 6 }, out: { fuel: 4 }, t: 6 },
  // Manufacturer
  computer:       { m: 'manufacturer', in: { circuit_board: 4, cable: 8, plastic: 16 }, out: { computer: 1 }, t: 24 },
  hmf:            { m: 'manufacturer', in: { modular_frame: 5, steel_pipe: 20, eib: 5, screw: 120 }, out: { hmf: 1 }, t: 30 },
  modular_engine: { m: 'manufacturer', in: { motor: 2, rubber: 15, smart_plating: 2 }, out: { modular_engine: 1 }, t: 60 },
  acu:            { m: 'manufacturer', in: { aw: 5, circuit_board: 5, hmf: 1, computer: 2 }, out: { acu: 2 }, t: 60 },
  hsc:            { m: 'manufacturer', in: { quickwire: 56, cable: 10, circuit_board: 1 }, out: { hsc: 1 }, t: 16 },
  supercomputer:  { m: 'manufacturer', in: { computer: 4, ai_limiter: 2, hsc: 3, plastic: 28 }, out: { supercomputer: 1 }, t: 32 },
  // Consumer electronics
  glass:          { m: 'smelter', in: { limestone: 2 }, out: { glass: 1 }, t: 4 },
  battery:        { m: 'assembler', in: { plastic: 2, copper_sheet: 2 }, out: { battery: 1 }, t: 8, hand: true },
  speaker:        { m: 'assembler', in: { wire: 8, plastic: 2 }, out: { speaker: 1 }, t: 8, hand: true },
  display:        { m: 'assembler', in: { glass: 3, circuit_board: 1 }, out: { display: 1 }, t: 12, hand: true },
  microchip:      { m: 'assembler', in: { copper_sheet: 2, quickwire: 8 }, out: { microchip: 2 }, t: 10, hand: true },
  camera_module:  { m: 'assembler', in: { glass: 2, microchip: 1 }, out: { camera_module: 1 }, t: 12, hand: true },
  television:     { m: 'electronics_factory', in: { display: 2, circuit_board: 2, speaker: 2, plastic: 6 }, out: { television: 1 }, t: 30 },
  smartphone:     { m: 'electronics_factory', in: { display: 1, microchip: 2, battery: 1, camera_module: 1 }, out: { smartphone: 1 }, t: 20 },
  laptop:         { m: 'electronics_factory', in: { display: 2, computer: 1, battery: 2, plastic: 4 }, out: { laptop: 1 }, t: 40 },
  game_console:   { m: 'electronics_factory', in: { microchip: 4, circuit_board: 2, plastic: 8, speaker: 1 }, out: { game_console: 1 }, t: 30 },

  // Alternate recipes (found on Hard Drives)
  alt_cast_screw:     { alt: true, name: n('Cast Screw', 'Dökme Vida'), m: 'constructor', in: { iron_ingot: 5 }, out: { screw: 20 }, t: 24 },
  alt_iron_wire:      { alt: true, name: n('Iron Wire', 'Demir Tel'), m: 'constructor', in: { iron_ingot: 5 }, out: { wire: 9 }, t: 24 },
  alt_steel_screw:    { alt: true, name: n('Steel Screw', 'Çelik Vida'), m: 'constructor', in: { steel_beam: 1 }, out: { screw: 52 }, t: 12 },
  alt_steel_rod:      { alt: true, name: n('Steel Rod', 'Çelik Çubuk'), m: 'constructor', in: { steel_ingot: 1 }, out: { iron_rod: 4 }, t: 5 },
  alt_caterium_wire:  { alt: true, name: n('Caterium Wire', 'Katerium Tel'), m: 'constructor', in: { caterium_ingot: 1 }, out: { wire: 8 }, t: 4 },
  alt_stitched_plate: { alt: true, name: n('Stitched Iron Plate', 'Dikişli Demir Levha'), m: 'assembler', in: { iron_plate: 10, wire: 20 }, out: { rip: 3 }, t: 32 },
  alt_bolted_plate:   { alt: true, name: n('Bolted Iron Plate', 'Cıvatalı Demir Levha'), m: 'assembler', in: { iron_plate: 18, screw: 50 }, out: { rip: 3 }, t: 12 },
  alt_copper_rotor:   { alt: true, name: n('Copper Rotor', 'Bakır Rotor'), m: 'assembler', in: { copper_sheet: 6, screw: 52 }, out: { rotor: 3 }, t: 16 },
  alt_bolted_frame:   { alt: true, name: n('Bolted Frame', 'Cıvatalı Çerçeve'), m: 'assembler', in: { rip: 3, screw: 56 }, out: { modular_frame: 2 }, t: 24 },
  alt_fused_wire:     { alt: true, name: n('Fused Wire', 'Kaynaşık Tel'), m: 'assembler', in: { copper_ingot: 4, caterium_ingot: 1 }, out: { wire: 30 }, t: 20 },
  alt_cat_circuit:    { alt: true, name: n('Caterium Circuit Board', 'Katerium Devre Kartı'), m: 'assembler', in: { plastic: 10, quickwire: 30 }, out: { circuit_board: 7 }, t: 48 },
  alt_solid_steel:    { alt: true, name: n('Solid Steel Ingot', 'Katı Çelik Külçe'), m: 'foundry', in: { iron_ingot: 2, coal: 2 }, out: { steel_ingot: 3 }, t: 3 },
  alt_iron_alloy:     { alt: true, name: n('Iron Alloy Ingot', 'Demir Alaşım Külçe'), m: 'foundry', in: { iron_ore: 2, copper_ore: 2 }, out: { iron_ingot: 5 }, t: 6 },
  alt_plastic_smart:  { alt: true, name: n('Plastic Smart Plating', 'Plastik Akıllı Kaplama'), m: 'manufacturer', in: { rip: 1, rotor: 1, plastic: 3 }, out: { smart_plating: 2 }, t: 24 },
  alt_heavy_flexible: { alt: true, name: n('Heavy Encased Frame', 'Ağır Kaplamalı Çerçeve'), m: 'manufacturer', in: { modular_frame: 8, eib: 10, steel_pipe: 36, concrete: 22 }, out: { hmf: 3 }, t: 64 },
  alt_rubber_concrete:{ alt: true, name: n('Rubber Concrete', 'Kauçuk Beton'), m: 'assembler', in: { limestone: 10, rubber: 2 }, out: { concrete: 9 }, t: 6 },
};

function recipeName(id) {
  const r = RECIPES[id];
  if (r.name) return L(r.name);
  return L(ITEMS[Object.keys(r.out)[0]].name);
}
function recipeMainOut(id) { return Object.keys(RECIPES[id].out)[0]; }

// Buildings. kind drives simulation behavior. size = square side in tiles.
const BUILDINGS = {
  hub: { kind: 'hub', size: 4, name: n('The HUB', 'HUB'), cat: null, cost: {}, gen: 30, reveal: 16, color: '#ff9a3c',
    desc: n('Your landing base. Items belted in go to Central Storage. Provides 30 MW, +5 MW per milestone.', 'İniş üssün. Bantla gelen eşyalar Merkez Depoya gider. 30 MW, her kilometre taşında +5 MW sağlar.') },
  belt1: { kind: 'belt', size: 1, tier: 1, speed: 1, name: n('Conveyor Belt Mk.1', 'Konveyör Bandı Mk.1'), cat: 'logistics', cost: { iron_plate: 1 }, reveal: 4,
    desc: n('Moves 120 items/min. Drag to draw.', 'Dakikada 120 eşya taşır. Çizmek için sürükle.') },
  belt2: { kind: 'belt', size: 1, tier: 2, speed: 2, name: n('Conveyor Belt Mk.2', 'Konveyör Bandı Mk.2'), cat: 'logistics', cost: { iron_plate: 1, screw: 2 }, reveal: 4,
    desc: n('Moves 240 items/min.', 'Dakikada 240 eşya taşır.') },
  belt3: { kind: 'belt', size: 1, tier: 3, speed: 4, name: n('Conveyor Belt Mk.3', 'Konveyör Bandı Mk.3'), cat: 'logistics', cost: { steel_beam: 1 }, reveal: 4,
    desc: n('Moves 480 items/min.', 'Dakikada 480 eşya taşır.') },
  belt4: { kind: 'belt', size: 1, tier: 4, speed: 6, name: n('Conveyor Belt Mk.4', 'Konveyör Bandı Mk.4'), cat: 'logistics', cost: { steel_pipe: 1, rubber: 1 }, reveal: 4,
    desc: n('Moves 720 items/min.', 'Dakikada 720 eşya taşır.') },
  splitter: { kind: 'splitter', size: 1, name: n('Conveyor Splitter', 'Konveyör Ayırıcı'), cat: 'logistics', cost: { iron_plate: 4 }, reveal: 3,
    desc: n('Splits one belt into up to three (front, left, right).', 'Bir bandı üçe kadar böler (ön, sol, sağ).') },
  junction: { kind: 'junction', size: 1, name: n('Belt Junction', 'Bant Kavşağı'), cat: 'logistics', cost: { iron_plate: 3, iron_rod: 2 }, reveal: 3,
    desc: n('Lets two belts cross each other.', 'İki bandın kesişmesini sağlar.') },
  uploader: { kind: 'uploader', size: 1, name: n('Dimensional Depot Uploader', 'Boyutsal Depo Yükleyici'), cat: 'logistics', cost: { iron_plate: 10, wire: 20 }, rate: 120, reveal: 4,
    desc: n('Uploads up to 120 items/min to Central Storage from anywhere.', 'Her yerden Merkez Depoya dakikada 120 eşya yükler.') },
  miner1: { kind: 'miner', size: 2, rate: 60, power: 5, name: n('Miner Mk.1', 'Madenci Mk.1'), cat: 'production', cost: { iron_plate: 10, iron_rod: 5 }, reveal: 6,
    desc: n('Place on an ore node. 60/min on Normal (x0.5 Impure, x2 Pure).', 'Cevher düğümüne yerleştir. Normal\'de 60/dk (Saf değil x0.5, Saf x2).') },
  miner2: { kind: 'miner', size: 2, rate: 120, power: 12, name: n('Miner Mk.2', 'Madenci Mk.2'), cat: 'production', cost: { modular_frame: 5, eib: 5 }, reveal: 6,
    desc: n('120/min on a Normal node.', 'Normal düğümde 120/dk.') },
  miner3: { kind: 'miner', size: 2, rate: 240, power: 30, name: n('Miner Mk.3', 'Madenci Mk.3'), cat: 'production', cost: { hmf: 3, computer: 5 }, reveal: 6,
    desc: n('240/min on a Normal node.', 'Normal düğümde 240/dk.') },
  oil_extractor: { kind: 'miner', size: 2, rate: 60, power: 40, oil: true, name: n('Oil Extractor', 'Petrol Çıkarıcı'), cat: 'production', cost: { motor: 5, eib: 10, cable: 40 }, reveal: 6,
    desc: n('Place on an oil well. Pumps barrels of Crude Oil.', 'Petrol kuyusuna yerleştir. Varil varil Ham Petrol pompalar.') },
  smelter: { kind: 'machine', size: 2, power: 4, name: n('Smelter', 'Eritici'), cat: 'production', cost: { iron_plate: 5, iron_rod: 5 }, reveal: 6,
    desc: n('Smelts ore into ingots.', 'Cevheri külçeye eritir.') },
  constructor: { kind: 'machine', size: 2, power: 4, name: n('Constructor', 'Yapıcı'), cat: 'production', cost: { iron_plate: 8, iron_rod: 8 }, reveal: 6,
    desc: n('Crafts one input into one output.', 'Tek girdiden tek çıktı üretir.') },
  assembler: { kind: 'machine', size: 3, power: 15, name: n('Assembler', 'Montajcı'), cat: 'production', cost: { rip: 4, rotor: 2, cable: 10 }, reveal: 6,
    desc: n('Combines two inputs.', 'İki girdiyi birleştirir.') },
  foundry: { kind: 'machine', size: 3, power: 16, name: n('Foundry', 'Dökümhane'), cat: 'production', cost: { modular_frame: 10, rotor: 10, concrete: 20 }, reveal: 6,
    desc: n('Smelts two ores into alloy ingots.', 'İki cevheri alaşım külçeye eritir.') },
  refinery: { kind: 'machine', size: 3, power: 30, name: n('Refinery', 'Rafineri'), cat: 'production', cost: { motor: 10, eib: 10, steel_pipe: 30, copper_sheet: 20 }, reveal: 6,
    desc: n('Refines Crude Oil into Plastic, Rubber and Fuel.', 'Ham Petrolü Plastik, Kauçuk ve Yakıta dönüştürür.') },
  manufacturer: { kind: 'machine', size: 4, power: 55, name: n('Manufacturer', 'İmalatçı'), cat: 'production', cost: { motor: 10, plastic: 40, modular_frame: 20 }, reveal: 7,
    desc: n('Combines up to four inputs into complex parts.', 'Dört girdiye kadar birleştirip karmaşık parçalar üretir.') },
  electronics_factory: { kind: 'machine', size: 4, power: 75, name: n('Electronics Factory', 'Elektronik Fabrikası'), cat: 'production', cost: { motor: 10, circuit_board: 20, glass: 50, plastic: 50 }, reveal: 7,
    desc: n('Assembles consumer tech: TVs, smartphones, laptops and game consoles.', 'Tüketici teknolojisi üretir: televizyon, akıllı telefon, dizüstü bilgisayar ve oyun konsolu.') },
  biomass_burner: { kind: 'gen', size: 2, gen: 30, fuels: { leaves: 3, wood: 15, biomass: 20 }, fuelCap: 200, name: n('Biomass Burner', 'Biyokütle Yakıcı'), cat: 'power', cost: { iron_plate: 15, iron_rod: 15 }, reveal: 5,
    desc: n('30 MW. Burns Leaves, Wood or Biomass.', '30 MW. Yaprak, Odun veya Biyokütle yakar.') },
  coal_gen: { kind: 'gen', size: 3, gen: 75, fuels: { coal: 4 }, fuelCap: 100, name: n('Coal Generator', 'Kömür Jeneratörü'), cat: 'power', cost: { rip: 10, rotor: 5, cable: 20 }, reveal: 5,
    desc: n('75 MW. Burns 15 Coal/min at full load.', '75 MW. Tam yükte dakikada 15 Kömür yakar.') },
  fuel_gen: { kind: 'gen', size: 3, gen: 150, fuels: { fuel: 5 }, fuelCap: 100, name: n('Fuel Generator', 'Yakıt Jeneratörü'), cat: 'power', cost: { motor: 10, eib: 10, rubber: 30 }, reveal: 5,
    desc: n('150 MW. Burns 12 Fuel/min at full load.', '150 MW. Tam yükte dakikada 12 Yakıt yakar.') },
  geothermal: { kind: 'gen', size: 3, gen: 100, geyser: true, fuels: null, name: n('Geothermal Generator', 'Jeotermal Jeneratör'), cat: 'power', cost: { motor: 8, steel_pipe: 40, circuit_board: 10 }, reveal: 6,
    desc: n('100 MW free power. Place on a geyser.', '100 MW bedava güç. Gayzer üzerine yerleştir.') },
  radar: { kind: 'radar', size: 2, power: 10, name: n('Radar Tower', 'Radar Kulesi'), cat: 'special', cost: { iron_plate: 30, wire: 30, concrete: 20 }, reveal: 24,
    desc: n('Reveals a large area around it.', 'Çevresindeki geniş bir alanı açığa çıkarır.') },
  sink: { kind: 'sink', size: 3, power: 30, name: n('Resource Sink', 'Kaynak Havuzu'), cat: 'special', cost: { rip: 15, cable: 30, concrete: 45 }, reveal: 5,
    desc: n('Destroys any item for points. Points print Coupons.', 'Herhangi bir eşyayı puan karşılığı yok eder. Puanlar kupon basar.') },
  space_elevator: { kind: 'elevator', size: 5, unique: true, name: n('Space Elevator', 'Uzay Asansörü'), cat: 'special', cost: { concrete: 100, iron_plate: 50, iron_rod: 100 }, reveal: 10,
    desc: n('Ship Project Parts to orbit to unlock new Tiers.', 'Yeni seviyeler açmak için Proje Parçalarını yörüngeye gönder.') },
};

const CATEGORIES = ['logistics', 'production', 'power', 'special'];

const START_BUILDINGS = ['belt1', 'miner1', 'smelter', 'constructor'];
const START_RECIPES = ['iron_ingot', 'iron_plate', 'iron_rod'];
const START_INV = { iron_plate: 40, iron_rod: 30 };

// Tier -> required Space Elevator phase
const TIER_PHASE = [0, 0, 0, 1, 1, 2, 2, 3];
const TIER_NAMES = [n('Onboarding', 'Başlangıç'), n('Tier 1', 'Seviye 1'), n('Tier 2', 'Seviye 2'), n('Tier 3', 'Seviye 3'), n('Tier 4', 'Seviye 4'), n('Tier 5', 'Seviye 5'), n('Tier 6', 'Seviye 6'), n('Tier 7', 'Seviye 7')];

const MILESTONES = [
  { id: 'm0_1', tier: 0, name: n('HUB Upgrade 1', 'HUB Yükseltme 1'), cost: { iron_rod: 10 }, b: ['biomass_burner'], r: ['biomass_leaves', 'biomass_wood'] },
  { id: 'm0_2', tier: 0, name: n('HUB Upgrade 2', 'HUB Yükseltme 2'), cost: { iron_plate: 20, iron_rod: 20 }, b: [], r: ['copper_ingot', 'wire', 'cable'] },
  { id: 'm0_3', tier: 0, name: n('HUB Upgrade 3', 'HUB Yükseltme 3'), cost: { iron_plate: 50, wire: 40 }, b: ['splitter', 'uploader'], r: ['concrete', 'screw'] },
  { id: 'm0_4', tier: 0, name: n('HUB Upgrade 4', 'HUB Yükseltme 4'), cost: { iron_plate: 75, cable: 30, concrete: 30 }, b: ['junction'], r: [], shards: 1 },
  { id: 'm1_logistics', tier: 1, name: n('Logistics Mk.2', 'Lojistik Mk.2'), cost: { screw: 150, iron_rod: 50 }, b: ['belt2'], r: [] },
  { id: 'm1_field', tier: 1, name: n('Field Research', 'Saha Araştırması'), cost: { wire: 80, concrete: 40 }, b: ['radar'], r: [], shards: 2 },
  { id: 'm2_part', tier: 2, name: n('Part Assembly', 'Parça Montajı'), cost: { cable: 60, concrete: 60, iron_plate: 100 }, b: ['assembler'], r: ['rip', 'rotor', 'modular_frame', 'smart_plating', 'copper_sheet'] },
  { id: 'm2_coal', tier: 2, name: n('Coal Power', 'Kömür Gücü'), cost: { rip: 20, rotor: 10, cable: 50 }, b: ['coal_gen'], r: [] },
  { id: 'm2_elevator', tier: 2, name: n('Space Elevator', 'Uzay Asansörü'), cost: { rip: 30, concrete: 100 }, b: ['space_elevator'], r: [] },
  { id: 'm2_sink', tier: 2, name: n('Resource Sink Program', 'Kaynak Havuzu Programı'), cost: { rotor: 20, modular_frame: 5 }, b: ['sink'], r: [] },
  { id: 'm3_steel', tier: 3, name: n('Basic Steel Production', 'Temel Çelik Üretimi'), cost: { rotor: 40, modular_frame: 20, concrete: 200 }, b: ['foundry'], r: ['steel_ingot', 'steel_beam', 'steel_pipe'] },
  { id: 'm3_logistics', tier: 3, name: n('Logistics Mk.3', 'Lojistik Mk.3'), cost: { steel_beam: 100, rip: 50 }, b: ['belt3'], r: [], shards: 2 },
  { id: 'm4_adv', tier: 4, name: n('Advanced Steel Production', 'İleri Çelik Üretimi'), cost: { steel_pipe: 200, steel_beam: 100, rotor: 50 }, b: ['miner2'], r: ['eib', 'stator', 'motor', 'vf', 'aw'] },
  { id: 'm5_oil', tier: 5, name: n('Oil Processing', 'Petrol İşleme'), cost: { motor: 50, eib: 100, modular_frame: 50 }, b: ['oil_extractor', 'refinery'], r: ['plastic', 'rubber', 'fuel', 'circuit_board'] },
  { id: 'm5_logistics', tier: 5, name: n('Logistics Mk.4', 'Lojistik Mk.4'), cost: { rubber: 200, eib: 50 }, b: ['belt4'], r: [], shards: 2 },
  { id: 'm5_fuel', tier: 5, name: n('Fuel Power', 'Yakıt Gücü'), cost: { plastic: 100, motor: 30 }, b: ['fuel_gen'], r: [] },
  { id: 'm6_ind', tier: 6, name: n('Industrial Manufacturing', 'Endüstriyel İmalat'), cost: { circuit_board: 100, motor: 50, plastic: 200 }, b: ['manufacturer'], r: ['computer', 'hmf', 'modular_engine', 'acu'] },
  { id: 'm6_cat', tier: 6, name: n('Caterium Electronics', 'Katerium Elektroniği'), cost: { circuit_board: 50, vf: 50 }, b: ['geothermal'], r: ['caterium_ingot', 'quickwire', 'ai_limiter'] },
  { id: 'm7_super', tier: 7, name: n('Supercomputing', 'Süper Hesaplama'), cost: { computer: 50, circuit_board: 200, hmf: 20 }, b: [], r: ['hsc', 'supercomputer'] },
  { id: 'm5_components', tier: 5, name: n('Electronic Components', 'Elektronik Bileşenler'), cost: { circuit_board: 30, motor: 20, plastic: 100 }, b: [], r: ['glass', 'battery', 'speaker'] },
  { id: 'm6_consumer', tier: 6, name: n('Consumer Electronics', 'Tüketici Elektroniği'), cost: { glass: 100, battery: 50, speaker: 50 }, b: ['electronics_factory'], r: ['display', 'television'], shards: 2 },
  { id: 'm7_mobile', tier: 7, name: n('Mobile Technology', 'Mobil Teknoloji'), cost: { television: 20, display: 50, ai_limiter: 50 }, b: [], r: ['microchip', 'camera_module', 'smartphone', 'laptop', 'game_console'], shards: 3 },
  { id: 'm7_miner', tier: 7, name: n('Miner Mk.3', 'Madenci Mk.3'), cost: { hmf: 10, computer: 20 }, b: ['miner3'], r: [], shards: 3 },
];

const PHASES = [
  { cost: { smart_plating: 25 }, tiers: [3, 4] },
  { cost: { smart_plating: 100, vf: 100, aw: 50 }, tiers: [5, 6] },
  { cost: { vf: 200, modular_engine: 40, acu: 20 }, tiers: [7] },
  { cost: { supercomputer: 25, acu: 50, modular_engine: 100, smartphone: 50 }, tiers: [], final: true },
];

const PURITY = {
  impure: { mult: 0.5, key: 'purity_impure', color: '#ff7a5a' },
  normal: { mult: 1, key: 'purity_normal', color: '#ffd166' },
  pure:   { mult: 2, key: 'purity_pure', color: '#7dff9a' },
};

const NODE_TYPES = {
  iron_ore: { color: '#b3705a', glow: '#ff9a7a' },
  copper_ore: { color: '#d4803e', glow: '#6fe0c2' },
  limestone: { color: '#e4dcc0', glow: '#fff6d8' },
  coal: { color: '#26262c', glow: '#8a8aa0' },
  caterium_ore: { color: '#e8c040', glow: '#fff08a' },
  crude_oil: { color: '#1b1224', glow: '#b07cff' },
  geyser: { color: '#6a7a88', glow: '#d8f4ff' },
};

const ACHIEVEMENTS = [
  { id: 'first_belt', name: n('Conveyor Life', 'Bant Hayatı'), desc: n('Build your first belt', 'İlk bandını inşa et') },
  { id: 'belts_200', name: n('Spaghetti Chef', 'Spagetti Şefi'), desc: n('Have 200 belts', '200 bandın olsun') },
  { id: 'first_milestone', name: n('Employee of the Month', 'Ayın Çalışanı'), desc: n('Complete a milestone', 'Bir kilometre taşı tamamla') },
  { id: 'milestones_10', name: n('Career Pioneer', 'Kariyer Öncüsü'), desc: n('Complete 10 milestones', '10 kilometre taşı tamamla') },
  { id: 'phase_1', name: n('Liftoff', 'Kalkış'), desc: n('Deliver Space Elevator Phase 1', 'Uzay Asansörü Faz 1\'i teslim et') },
  { id: 'phase_3', name: n('Orbital Logistics', 'Yörünge Lojistiği'), desc: n('Deliver Phase 3', 'Faz 3\'ü teslim et') },
  { id: 'win', name: n('Project Assembly', 'Proje Montajı'), desc: n('Complete the Space Elevator', 'Uzay Asansörünü tamamla') },
  { id: 'plates_1000', name: n('Plate Tectonics', 'Levha Tektoniği'), desc: n('Deliver 1,000 Iron Plates', '1.000 Demir Levha teslim et') },
  { id: 'overclock', name: n('Overclocked', 'Hız Aşırtma'), desc: n('Overclock a machine', 'Bir makineyi hızlandır') },
  { id: 'hard_drive', name: n('Data Miner', 'Veri Madencisi'), desc: n('Analyze a Hard Drive', 'Bir Sabit Disk analiz et') },
  { id: 'slugs_10', name: n('Slug Hunter', 'Salyangoz Avcısı'), desc: n('Collect 10 Power Slugs', '10 Güç Salyangozu topla') },
  { id: 'power_500', name: n('Power Plant', 'Enerji Santrali'), desc: n('Have 500 MW capacity', '500 MW kapasiten olsun') },
  { id: 'sink_100k', name: n('Consumerism', 'Tüketim Çılgınlığı'), desc: n('Earn 100,000 sink points', '100.000 havuz puanı kazan') },
  { id: 'first_tv', name: n('Prime Time', 'Prime Time'), desc: n('Deliver a Television', 'Bir Televizyon teslim et') },
  { id: 'first_phone', name: n('Hello, World!', 'Merhaba Dünya!'), desc: n('Deliver a Smartphone', 'Bir Akıllı Telefon teslim et') },
  { id: 'gadgets_100', name: n('Tech Giant', 'Teknoloji Devi'), desc: n('Deliver 100 consumer devices', '100 elektronik cihaz teslim et') },
  { id: 'machines_50', name: n('Industrialist', 'Sanayici'), desc: n('Have 50 production buildings', '50 üretim binan olsun') },
];

const TUTORIAL = [
  { id: 'miner', text: n('Select <b>Miner Mk.1</b> (Production tab, bottom bar) and place it on an <b>Iron Ore</b> node.', '<b>Madenci Mk.1</b>\'i seç (alt çubuk, Üretim sekmesi) ve bir <b>Demir Cevheri</b> düğümüne yerleştir.') },
  { id: 'smelter', text: n('Place a <b>Smelter</b> a few tiles away from the miner.', 'Madenciden birkaç kare uzağa bir <b>Eritici</b> yerleştir.') },
  { id: 'belt', text: n('Select <b>Conveyor Belt</b>, click the <b>Miner</b>, then click the <b>Smelter</b>. The belt is laid in one piece.', '<b>Konveyör Bandı</b>\'nı seç, önce <b>Madenci</b>\'ye, sonra <b>Eritici</b>\'ye tıkla. Bant tek parça döşenir.') },
  { id: 'constructor', text: n('Place a <b>Constructor</b> and belt the Smelter into it (click Smelter, then Constructor). It makes <b>Iron Plates</b>.', 'Bir <b>Yapıcı</b> yerleştir ve Eriticiyi ona bantla (önce Eritici, sonra Yapıcı). <b>Demir Levha</b> üretir.') },
  { id: 'hub', text: n('Belt the Constructor into the <b>HUB</b> (big orange building). Everything that reaches the HUB goes to your storage.', 'Yapıcıyı <b>HUB</b>\'a (büyük turuncu bina) bantla. HUB\'a ulaşan her şey depona girer.') },
  { id: 'milestone', ms: 'm0_1', text: n('Complete <b>HUB Upgrade 1</b>: press <b>Complete</b> below when the bar is full.', '<b>HUB Yükseltme 1</b>\'i tamamla: çubuk dolunca aşağıdaki <b>Tamamla</b>\'ya bas.') },
  { id: 'rods', ms: 'm0_2', text: n('HUB Upgrade 2 needs <b>Iron Rods</b>. Build a second <b>Miner → Smelter → Constructor</b> line, then <b>click the new Constructor</b> and pick the <b>Iron Rod</b> recipe. Belt it into the HUB.', 'HUB Yükseltme 2 için <b>Demir Çubuk</b> gerekiyor. İkinci bir <b>Madenci → Eritici → Yapıcı</b> hattı kur, sonra <b>yeni Yapıcıya tıkla</b> ve <b>Demir Çubuk</b> tarifini seç. HUB\'a bantla.') },
  { id: 'hub2', ms: 'm0_2', text: n('Collect 20 Iron Plates and 20 Iron Rods, then press <b>Complete</b> below to finish <b>HUB Upgrade 2</b>.', '20 Demir Levha ve 20 Demir Çubuk topla, sonra <b>HUB Yükseltme 2</b>\'yi bitirmek için aşağıdaki <b>Tamamla</b>\'ya bas.') },
  { id: 'power', text: n('More machines need more power. Place a <b>Biomass Burner</b> (Power tab), click it and press <b>+ Fuel</b>. Click trees to collect Leaves and Wood.', 'Daha çok makine daha çok güç ister. Bir <b>Biyokütle Yakıcı</b> yerleştir (Güç sekmesi), ona tıkla ve <b>+ Yakıt</b>\'a bas. Yaprak ve Odun için ağaçlara tıkla.') },
];

// HUB visual stages, reached by completed milestone count
const HUB_STAGES = [
  { at: 0, name: n('Landing Pod', 'İniş Kapsülü'), trim: '#ff9a3c' },
  { at: 1, name: n('Outpost', 'Karakol'), trim: '#ff9a3c' },
  { at: 4, name: n('Base', 'Üs'), trim: '#ffc23c' },
  { at: 9, name: n('Command Center', 'Komuta Merkezi'), trim: '#7fd4ff' },
  { at: 15, name: n('Orbital Command', 'Yörünge Komutası'), trim: '#c77dff' },
];
// Modules bolted onto the HUB as milestones are completed (shown in the HUB panel)
const HUB_MODULES = [
  { at: 1, name: n('Radio antenna', 'Radyo anteni') },
  { at: 2, name: n('Storage tanks', 'Depolama tankları') },
  { at: 3, name: n('Solar panels', 'Güneş panelleri') },
  { at: 4, name: n('Radar dish', 'Radar çanağı') },
  { at: 6, name: n('Control room lights', 'Kontrol odası ışıkları') },
  { at: 8, name: n('Corner beacons', 'Köşe fenerleri') },
  { at: 10, name: n('Hologram ring', 'Hologram halkası') },
  { at: 13, name: n('Energy core', 'Enerji çekirdeği') },
  { at: 16, name: n('Orbital uplink', 'Yörünge bağlantısı') },
  { at: 20, name: n('Golden aura', 'Altın hale') },
];
const HUB_MW_PER_LEVEL = 5;
