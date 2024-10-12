import mailchimp from "@mailchimp/mailchimp_marketing";
import mailchimpTransactional from "@mailchimp/mailchimp_transactional";
import {
	EMAIL_FROM_EMAIL,
	EMAIL_FROM_NAME,
	MAILCHIMP_API_KEY,
	MAILCHIMP_AUDIENCE_ID,
	MAILCHIMP_SERVER_PREFIX,
} from "./env.js";
import { AppError } from "./errors.js";
import logger from "./logger.js";

mailchimp.setConfig({
	apiKey: MAILCHIMP_API_KEY,
	server: MAILCHIMP_SERVER_PREFIX,
});

const transactionalClient = mailchimpTransactional(MAILCHIMP_API_KEY);

// Type guard to check if the response is a successful campaign
function isCampaign(
	response: mailchimp.campaigns.Campaigns | mailchimp.ErrorResponse,
): response is mailchimp.campaigns.Campaigns {
	return (response as mailchimp.campaigns.Campaigns).id !== undefined;
}

// Create and send a campaign immediately
export async function createAndSendCampaign(
	htmlContent: string,
	listId = MAILCHIMP_AUDIENCE_ID,
	subject = "Homecare News by TrollyCare",
) {
	try {
		// Create the campaign
		const campaignResponse = await mailchimp.campaigns.create({
			type: "regular",
			recipients: { list_id: listId },
			settings: {
				subject_line: subject,
				from_name: "TrollyCare Insurance",
				reply_to: "hello@trollycare.com",
			},
		});

		// Check if the campaign was created successfully
		if (!isCampaign(campaignResponse)) {
			throw new AppError(
				`Failed to create campaign: ${JSON.stringify(campaignResponse)}`,
			);
		}

		const campaignId = campaignResponse.id;

		// Set the campaign content
		await mailchimp.campaigns.setContent(campaignId, {
			html: htmlContent,
		});

		// Send the campaign immediately
		await mailchimp.campaigns.send(campaignId);

		logger.info(`Campaign created and sent. ID: ${campaignId}`);
		return campaignId;
	} catch (error) {
		logger.error("Error creating and sending campaign:", error);
		throw error;
	}
}

interface TransactionalEmailParams {
	to: string[];
	subject: string;
	type?: "html" | "text";
	body: string;
	fromEmail?: string;
	fromName?: string;
}

// Type guard to check if the response is a successful campaign
function isTransactionSuccessful(
	response: mailchimpTransactional.MessagesSendResponse | unknown,
): response is mailchimpTransactional.MessagesSendResponse {
	return (response as mailchimp.campaigns.Campaigns).id !== undefined;
}

export async function sendTransactionalEmail({
	to,
	subject,
	body,
	type = "text",
	fromEmail = EMAIL_FROM_EMAIL,
	fromName = EMAIL_FROM_NAME,
}: TransactionalEmailParams) {
	const toFormatted = [...to.map((email) => ({ email }))];
	try {
		const response = await transactionalClient.messages.send({
			message: {
				html: type === "html" ? body : undefined,
				text: type === "text" ? body : undefined,
				subject: subject,
				from_email: fromEmail,
				from_name: fromName,
				to: toFormatted,
				important: true,
				track_opens: true,
				track_clicks: true,
			},
		});

		if (!isTransactionSuccessful(response)) {
			throw new AppError(`Failed to send transactional email: ${response}`);
		}

		if (response[0].status !== "sent" && response[0].status !== "queued") {
			throw new AppError(`Failed to send email: ${response[0].status}`);
		}

		logger.info(`Transactional email sent successfully to ${to}`);

		return { data: response };
	} catch (error) {
		let errorMessage = "Unknown error occurred";
		let errorDetails = {};

		if (error instanceof Error) {
			errorMessage = error.message;
			errorDetails = { name: error.name, stack: error.stack };
		}

		// Check if the error object has a response property (common in HTTP errors)
		if (error && typeof error === "object" && "response" in error) {
			const responseError = error as {
				response?: { status?: number; data?: unknown };
			};
			if (responseError.response) {
				errorDetails = {
					...errorDetails,
					status: responseError.response.status,
					data: responseError.response.data,
				};

				if (responseError.response.status === 401) {
					errorMessage =
						"Authentication failed. Please check your Mailchimp API key.";
				}
			}
		}

		logger.error("Error sending transactional email:", {
			error: errorMessage,
			details: errorDetails,
		});

		throw new AppError(`Failed to send transactional email: ${errorMessage}`);
	}
}
