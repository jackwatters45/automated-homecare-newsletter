import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(html: string, to = "jack.watters@me.com") {
	const date = new Date();
	const formattedDate = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const { data, error } = await resend.emails.send({
		from: "Yats Support <support@yatusabes.co>",
		to,
		subject: `Test Newsletter' - ${formattedDate}`,
		html,
	});

	if (error) {
		return console.error({ error });
	}

	return new Response(
		JSON.stringify({ message: "Email sent successfully", data }),
	);
}
