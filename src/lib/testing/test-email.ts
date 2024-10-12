import mailchimpTransactional from "@mailchimp/mailchimp_transactional";
import { MAILCHIMP_API_KEY } from "../env.js";

const transactionalClient = mailchimpTransactional(MAILCHIMP_API_KEY);

function test() {
	transactionalClient.messages.send({
		message: {
			to: [{ email: "jack.watters@me.com" }],
			from_email: "jackwattersdev@gmail.com",
			subject: "Test",
			html: "<h1>Test</h1>",
		},
	});
}

test();
