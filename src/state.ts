const cursorLineMap = new Map<string, number>();

export function setCursorLine(filePath: string, line: number) {
    // Store the latest cursor line for the given file
    cursorLineMap.set(filePath, line);
}

export function getCursorLine(filePath: string): number | undefined {
     const line = cursorLineMap.get(filePath);
 
     // If the file no longer exists, remove stale entry
     if (line !== undefined) {
         try {
             require('fs').accessSync(filePath);
         } catch {
             cursorLineMap.delete(filePath);
             return undefined;
         }
     }
 
     return line;
}

export function clearCursorLine(filePath: string) {
    // Explicitly remove cursor tracking for a file
    cursorLineMap.delete(filePath);
}
