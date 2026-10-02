export async function resolve(specifier, context, next) {
    if (specifier === 'phaser') return { url: new URL('./stubs/phaser.js', import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
}
