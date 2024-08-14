import Bottleneck from "bottleneck";

export const rateLimiter = new Bottleneck({
	maxConcurrent: 10,
	minTime: 2000,
});
