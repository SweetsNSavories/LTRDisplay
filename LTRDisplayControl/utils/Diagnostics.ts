const PREFIX = "[LTRDisplay]";

// Lightweight console diagnostics helper
export const diag = {
    info: (message: string, data?: any) => {
        if (data !== undefined) {
            console.log(`${PREFIX} ${message}`, data);
        } else {
            console.log(`${PREFIX} ${message}`);
        }
    },
    error: (message: string, error?: any, data?: any) => {
        if (data !== undefined) {
            console.error(`${PREFIX} ${message}`, data, error);
        } else {
            console.error(`${PREFIX} ${message}`, error);
        }
    }
};
