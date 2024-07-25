type EnvVariables = {
	KINDE_CLIENT_ID: string;
	KINDE_CLIENT_SECRET: string;
	KINDE_BASE_URL: string;
	BASE_URL: string;
};

export function getEnvVariables(): EnvVariables {
	const variables: Partial<EnvVariables> = {
		KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID,
		KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET,
		KINDE_BASE_URL: process.env.KINDE_BASE_URL,
		BASE_URL: process.env.BASE_URL,
	};

	const missingVariables = Object.entries(variables)
		.filter(([_, value]) => !value)
		.map(([key]) => key);

	if (missingVariables.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missingVariables.join(", ")}`,
		);
	}

	// Additional check for BASE_URL format
	if (!/^https?:\/\//.test(variables.BASE_URL as string)) {
		throw new Error("BASE_URL must start with http:// or https://");
	}

	return variables as EnvVariables;
}
