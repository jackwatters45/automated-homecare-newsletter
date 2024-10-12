import mailchimpTransactional from "@mailchimp/mailchimp_transactional";
const transactionalClient = mailchimpTransactional(
	"85f73a1bd17c718c76e56f980f587e93-us14",
);

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
