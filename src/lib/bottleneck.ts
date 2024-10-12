import Bottleneck from "bottleneck";

export const bottleneck = new Bottleneck({ minTime: 200, maxConcurrent: 5 });
