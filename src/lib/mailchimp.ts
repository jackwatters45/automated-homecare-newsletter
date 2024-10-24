import mailchimp from "@mailchimp/mailchimp_marketing";
import {
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
