const fs = require('fs');
const path = require('path');

class DataStore {
  constructor() {
    this.unitClasses = new Map();
    this.loreTraits = new Map();
    this.characters = new Map();
    this.dharmaConfig = null;
    this.isLoaded = false;
  }

  static load(dataDir = path.join(__dirname, '../data')) {
    if (DataStore.instance && DataStore.instance.isLoaded) {
      return DataStore.instance;
    }

    const store = new DataStore();

    // 1. Load Unit Classes
    const unitClassesPath = path.join(dataDir, 'global/unit_classes.json');
    if (fs.existsSync(unitClassesPath)) {
      const classes = JSON.parse(fs.readFileSync(unitClassesPath, 'utf8'));
      classes.forEach(c => store.unitClasses.set(c.class_id, c));
    }

    // 2. Load Lore Traits & Astras
    const lorePath = path.join(dataDir, 'global/lore.json');
    if (fs.existsSync(lorePath)) {
      const lore = JSON.parse(fs.readFileSync(lorePath, 'utf8'));
      if (lore.traits) {
        lore.traits.forEach(t => store.loreTraits.set(t.trait_id, t));
      }
    }

    // 3. Load Characters
    const charactersPath = path.join(dataDir, 'global/characters.json');
    if (fs.existsSync(charactersPath)) {
      const characters = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
      if (characters.characters) {
        characters.characters.forEach(c => store.characters.set(c.character_id, c));
      }
    }

    // 4. Load Dharma Config
    const dharmaPath = path.join(dataDir, 'global/dharma_config.json');
    if (fs.existsSync(dharmaPath)) {
      store.dharmaConfig = JSON.parse(fs.readFileSync(dharmaPath, 'utf8'));
    }

    store.isLoaded = true;
    DataStore.instance = store;
    return store;
  }

  getUnitClass(classId) {
    return this.unitClasses.get(classId);
  }

  getTrait(traitId) {
    return this.loreTraits.get(traitId);
  }

  getCharacter(characterId) {
    return this.characters.get(characterId);
  }
}

module.exports = DataStore;
