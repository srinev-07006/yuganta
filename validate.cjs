// =============================================================
// validate.cjs — Automated Data Validator
// =============================================================
// This script runs on Node.js using CommonJS. It reads your 
// JSON files and validates them against the JSON schemas.
// =============================================================

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Initialize AJV validator with looser strictness rules for draft-07 compatibility
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const DATA_DIR = path.join(__dirname, 'public', 'data'); // ✅ Fixed!

// Load Schemas from the central schema directory
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
            console.error(`\x1b[31m❌ Validation Error in ${filePath.replace(DATA_DIR, '')}:\x1b[0m`);
            console.error(validator.errors);
            hasErrors = true;
        } else {
            console.log(`\x1b[32m✅ Validated [${type}]: ${filePath.replace(DATA_DIR, '')}\x1b[0m`);
        }
    } catch (e) {
        console.error(`\x1b[31m❌ Parse Error in ${filePath.replace(DATA_DIR, '')}:\x1b[0m`, e.message);
        hasErrors = true;
    }
}

console.log('--- Validating Global Lore ---');
validateFile(path.join(DATA_DIR, 'global/characters.json'), validateLore, 'Lore Schema');
validateFile(path.join(DATA_DIR, 'global/lore.json'), validateLore, 'Lore Schema');

console.log('\n--- Validating Parvas ---');
const parvaDirs = glob.sync(path.join(DATA_DIR, 'parvas/*'));

parvaDirs.forEach(parvaDir => {
    try {
        const metaPath = path.join(parvaDir, '_meta.json');
        if (fs.existsSync(metaPath)) {
            JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            console.log(`\x1b[32m✅ Validated [Meta]: ${metaPath.replace(DATA_DIR, '')}\x1b[0m`);
        }
    } catch(e) {
        console.error(`\x1b[31m❌ Parse Error in _meta.json\x1b[0m`);
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
    console.error('\n\x1b[31m⚠️ Validation completed with errors.\x1b[0m');
    process.exit(1);
} else {
    console.log('\n\x1b[32m🎉 All JSON files passed validation successfully!\x1b[0m');
}