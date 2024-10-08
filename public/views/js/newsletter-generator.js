document.getElementById("generateBtn").addEventListener("click", async () => {
	const result = document.getElementById("result");
	result.textContent = "Generating data...";

	try {
		const response = await fetch("/test/generate");

		const data = await response.json();

		if (data.success) {
			result.innerHTML = `Data generated successfully. <a href="/test/newsletters/${data.id}">View Newsletter</a>`;
		} else {
			result.textContent = data.message;
		}
	} catch (error) {
		result.textContent = `Error generating data${JSON.stringify(error)}`;
	}
});
