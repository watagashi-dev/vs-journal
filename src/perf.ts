import { performance } from "perf_hooks";

const enablePerf = false;

export async function measure<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!enablePerf) {
    return fn();
  }

  const start = performance.now();
  try {
    return await fn();
  } finally {
    const end = performance.now();
    const duration = end - start;
    console.log(`[Perf] ${name}: ${duration} ms`);
  }
}
