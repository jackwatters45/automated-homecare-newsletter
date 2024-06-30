import { promises as fs } from "node:fs";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function renderTemplate<T>(
	data: T,
	fileName = "src/newsletter.hbs",
): Promise<string> {
	const source = await fs.readFile(fileName, "utf-8");
	const template = Handlebars.compile(source);

	const meep = template({ articles: data });

	fs.writeFile("meep.html", meep);

	return meep;
}

export async function sendEmail(html: string, to = "jack.watters@me.com") {
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
