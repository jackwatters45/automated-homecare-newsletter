import Bottleneck from "bottleneck";

export const rateLimiter = new Bottleneck({ minTime: 200, maxConcurrent: 5 });
