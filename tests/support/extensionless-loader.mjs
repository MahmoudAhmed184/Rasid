export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        const canRetry =
            error?.code === 'ERR_MODULE_NOT_FOUND' &&
            (specifier.startsWith('./') || specifier.startsWith('../')) &&
            !specifier.endsWith('.js');

        if (!canRetry) {
            throw error;
        }

        return nextResolve(`${specifier}.js`, context);
    }
}
