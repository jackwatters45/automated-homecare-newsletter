import Bottleneck from "bottleneck";

export const rateLimiter = new Bottleneck({
	maxConcurrent: 15,
	minTime: 2500,
});
