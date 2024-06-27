type PageToScrape = {
	url: string;
};

export const testPage: PageToScrape = { url: "https://hospicenews.com/" };

export const specificPages: PageToScrape[] = [
	{ url: "https://hospicenews.com/" },
	{ url: "https://nahc.org/nahc-newsroom/" },
	{ url: "https://www.homecaremag.com/news" },
	{ url: "https://www.mcknightshomecare.com/home/news/" },
	{ url: "https://homehealthcarenews.com/" },
	{ url: "https://valleyhca.com/our-blog/" },
	{ url: "https://www.medicalnewstoday.com/news" },
	{
		url: "https://netforum.avectra.com/eWeb/DynamicPage.aspx?Site=HCLA&WebCode=NationalHomeCareNews",
	},
	{ url: "https://caregiver.com/articles" },
	{ url: "https://dailycaring.com/" },
	{ url: "https://www.casacompanionhomecare.com/blog/" },
	{ url: "https://www.healthcarefinancenews.com/" },
	{ url: "https://hospicenews.com/" },
];
