const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const DATA_DIR = path.join(__dirname, 'data');

// Load Schemas
const narrativeSchema = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schemas/narrative.schema.json'), 'utf8'));
const tacticalSchema = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schemas/tactical.schema.json'), 'utf8'));
const loreSchema = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schemas/lore.schema.json'), 'utf8'));

// Compile Validators
const validateNarrative = ajv.compile(narrativeSchema);
const validateTactical = ajv.compile(tacticalSchema);
const validateLore = ajv.compile(loreSchema);

let hasErrors = false;

function validateFile(filePath, validator, type) {
    if (!fs.existsSync(filePath)) return;
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const valid = validator(data);
        if (!valid) {
            console.error(`❌ Validation Error in ${filePath.replace(DATA_DIR, '')}:`);
            console.error(validator.errors);
            hasErrors = true;
        } else {
            console.log(`✅ Validated [${type}]: ${filePath.replace(DATA_DIR, '')}`);
        }
    } catch (e) {
        console.error(`❌ Parse Error in ${filePath.replace(DATA_DIR, '')}:`, e.message);
        hasErrors = true;
    }
}

console.log('--- Validating Global Lore ---');
validateFile(path.join(DATA_DIR, 'global/characters.json'), validateLore, 'Lore Schema');
validateFile(path.join(DATA_DIR, 'global/lore.json'), validateLore, 'Lore Schema');

console.log('\n--- Validating Parvas ---');
const parvaDirs = glob.sync(path.join(DATA_DIR, 'parvas/*'));

parvaDirs.forEach(parvaDir => {
    // We didn't create a strict schema for _meta.json, so skipping it for schema validation, but we can check if it parses.
    try {
        JSON.parse(fs.readFileSync(path.join(parvaDir, '_meta.json'), 'utf8'));
        console.log(`✅ Validated [Meta]: ${path.join(parvaDir, '_meta.json').replace(DATA_DIR, '')}`);
    } catch(e) {
        console.error(`❌ Parse Error in _meta.json`);
        hasErrors = true;
    }

    validateFile(path.join(parvaDir, 'timeline.json'), validateTactical, 'Tactical Schema');
    validateFile(path.join(parvaDir, 'directives.json'), validateTactical, 'Tactical Schema');

    const dialogueFiles = glob.sync(path.join(parvaDir, 'dialogues/*.json'));
    dialogueFiles.forEach(f => {
        validateFile(f, validateNarrative, 'Narrative Schema');
    });
});

if (hasErrors) {
    console.error('\n⚠️ Validation completed with errors.');
    process.exit(1);
} else {
    console.log('\n🎉 All JSON files passed validation successfully!');
}