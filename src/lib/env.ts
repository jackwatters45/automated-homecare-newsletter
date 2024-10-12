import { AppError } from "./errors.js";

const getEnv = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new AppError(`Missing environment variable: ${name}`);
	}
	return value;
};

export const MAILCHIMP_API_KEY = getEnv("MAILCHIMP_API_KEY");
export const MAILCHIMP_SERVER_PREFIX = getEnv("MAILCHIMP_SERVER_PREFIX");
export const MAILCHIMP_AUDIENCE_ID = getEnv("MAILCHIMP_AUDIENCE_ID");
export const EMAIL_FROM_EMAIL = getEnv("EMAIL_FROM_EMAIL");
export const EMAIL_FROM_NAME = getEnv("EMAIL_FROM_NAME");
