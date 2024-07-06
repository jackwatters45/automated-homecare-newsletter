import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
	dsn: "https://fb0de06e10d901eb3719686ceea81c96@o4507179419238400.ingest.us.sentry.io/4507546971406336",
	integrations: [nodeProfilingIntegration()],
	// Performance Monitoring
	tracesSampleRate: 1.0, //  Capture 100% of the transactions

	// Set sampling rate for profiling - this is relative to tracesSampleRate
	profilesSampleRate: 1.0,
});
