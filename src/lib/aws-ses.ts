import {
	SESClient,
	SendEmailCommand,
	type SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { AWS_REGION, EMAIL_FROM_EMAIL } from "./env.js";
import { AppError } from "./errors.js";

// Create SES service object
const sesClient = new SESClient({ region: AWS_REGION });

interface EmailParams {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	from?: string;
}

export async function sendTransactionalEmail({
	to,
	subject,
	text,
	html,
	from = EMAIL_FROM_EMAIL,
}: EmailParams) {
	const emailParams: SendEmailCommandInput = {
		Destination: {
			ToAddresses: Array.isArray(to) ? to : [to],
		},
		Message: {
			Body: {},
			Subject: {
				Charset: "UTF-8",
				Data: subject,
			},
		},
		Source: from,
	};

	if (text && html) {
		throw new AppError("Cannot send both text and html");
	}

	if (!emailParams?.Message?.Body) {
		throw new AppError("Missing message body");
	}

	if (text) {
		emailParams.Message.Body.Text = {
			Charset: "UTF-8",
			Data: text,
		};
	}

	if (html) {
		emailParams.Message.Body.Html = {
			Charset: "UTF-8",
			Data: html,
		};
	}

	try {
		const data = await sesClient.send(new SendEmailCommand(emailParams));
		console.log("Email sent successfully:", data.MessageId);
		return data;
	} catch (err) {
		console.error("Error", err);
		throw err;
	}
}
