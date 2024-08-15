import Bottleneck from "bottleneck";

export const rateLimiter = new Bottleneck({ minTime: 500 });
