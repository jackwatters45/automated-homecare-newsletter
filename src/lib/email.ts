import { Resend } from "resend";
import logger from "./logger.js";
import { getEnv } from "./utils.js";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(html: string, to: string[]) {
	const date = new Date();
	const formattedDate = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const { data, error } = await resend.emails.send({
		from: getEnv("RESEND_FROM_EMAIL"),
		to,
		subject: `TrollyCare Newsletter - ${formattedDate}`,
		html,
	});

	if (error) {
		return logger.error("Error sending email", { error, to, html });
	}

	return { message: "Email sent successfully", data };
}

export async function sendTestEmail(html: string) {
	const to = [getEnv("REVIEWER_EMAIL")];

	return await sendEmail(html, to);
}
