import path from "node:path";
import type { PageToScrape } from "../types/index.js";

export const TEST_PAGES: PageToScrape[] = [
	{
		url: "https://pqhh.org/media-center/",
		articleContainerSelector: ".fl-post-text",
		linkSelector: ".fl-post-title > a",
		titleSelector: ".fl-post-title",
		descriptionSelector: undefined,
		dateSelector: ".fl-post-meta",
	},
];

export const SPECIFIC_PAGES: PageToScrape[] = [
	{
		url: "https://pqhh.org/media-center/",
		articleContainerSelector: ".fl-post-text",
		linkSelector: ".fl-post-title > a",
		titleSelector: ".fl-post-title",
		descriptionSelector: undefined,
		dateSelector: ".fl-post-meta",
	},
	{
		url: "https://www.mcknightshomecare.com/home/news/",
		articleContainerSelector: ".article-teaser",
		linkSelector: "a",
		titleSelector: ".card-title",
		descriptionSelector: ".card-text",
		dateSelector: ".post-date",
	},
	{
		url: "https://homehealthcarenews.com/",
		articleContainerSelector: ".entry-block",
		linkSelector: "h2 > a",
		titleSelector: ".entry-title",
		descriptionSelector: undefined,
		dateSelector: ".entry-date",
		removeIfNoDate: true,
	},
	// {
	// 	url: "https://valleyhca.com/our-blog/",
	// 	articleContainerSelector: "article",
	// 	linkSelector: "a",
	// 	titleSelector: ".tpn-postheader",
	// 	descriptionSelector: "p",
	// 	dateSelector: ".entry-date",
	// },
	{
		url: "https://www.medicalnewstoday.com/news",
		articleContainerSelector: ".css-kbq0t",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: ".css-3be604",
	},
	{
		url: "https://dailycaring.com/",
		articleContainerSelector: "article",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: undefined,
	},
	{
		url: "https://www.casacompanionhomecare.com/blog/",
		articleContainerSelector: ".fl-post-grid-post",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: undefined,
	},
];

export const TOPIC = "homecare (medical) and home health (medical)";

export const DESCRIPTION_MAX_LENGTH = 35;

export const COMPANY_NAME = "TrollyCare";

export const PORT = process.env.PORT || 8080;

export const CLIENT_PORT = process.env.CLIENT_PORT || 5173;

export const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

export const API_URL = IS_DEVELOPMENT
	? `http://localhost:${PORT}`
	: "automated-homecare-newsletter-production.up.railway.app";

export const CLIENT_URL = IS_DEVELOPMENT
	? `http://localhost:${CLIENT_PORT}`
	: "https://trollycare-newsletter.vercel.app";

export const BASE_PATH = path.resolve();

export const CATEGORIES = [
	"Industry Trends & Policy",
	"Clinical Innovations & Best Practices",
	"Business Operations & Technology",
	"Caregiver Support & Resources",
	"Other",
] as const;

export const SYSTEM_INSTRUCTION = `You are a homecare business operator. You are an expert in homecare news and are tasked with choosing which articles to include in a newsletter as well as generating a summary for the newsletter and cleaning up the content of the articles.
	\n\n
	Please provide your response in valid JSON format. The entire response should be a single JSON object or array. Do not include any explanatory text outside of the JSON structure.
	`;

export const REDIRECT_URLS = ["https://news.google.com"];

export const INITIAL_FETCH_COUNT = 40;
export const TARGET_NUMBER_OF_ARTICLES = 30;
export const MIN_NUMBER_OF_ARTICLES = TARGET_NUMBER_OF_ARTICLES - 10;
export const MAX_ARTICLES_PER_SOURCE = 5;
export const MAX_RETRIES = 3;

export const CACHE_KEY = "articleData";

export const BLACKLISTED_DOMAINS = [
	"https://news.google.com",
	"https://nahc.com",
	"https://www.nejm.org",
	"https://patch.com",
	"https://www.bendbulletin.com",
	"https://www.upworthy.com",
	"https://www.massgeneralbrigham.org",
	"https://www.thepharmaletter.com",
	"https://www.thedailybeast.com",
	"https://www.post-gazette.com",
	"https://seekingalpha.com",
	"https://fredericksburg.com",
	"https://www.yardbarker.com",
	"https://www.theitem.com",
	"https://www.milb.com",
	"https://downtownakron.com",
	"https://zoominfo.com",
	"https://chaindesk.ai",
	"https://dmagazine.com",
	"https://thetradeshownetwork.com",
	"https://usnews.com",
	"https://eventbrite.com",
	"https://medicalresearch.com",
	"https://indeed.com",
	"https://stockanalysis.com",
	"https://tiktok.com",
	"https://reddit.com",
	"https://city.milwaukee.gov",
	"https://colorado-hcp-portal.coxix.gainwelltechnologies.com",
	"https://events.blackthorn.io",
	"https://governmentjobs.com",
	"https://hcps.org",
	"https://law.lis.virginia.gov",
	"https://nebraska.gov",
	"https://ogletree.com",
	"https://jobs.apple.com",
	"https://timesofisrael.com",
	"https://jobs.myflorida.com",
	"https://zinio.com",
	"https://iotajobs.org",
	"https://etsy.com",
	"https://messagemedia.co",
	"https://glassdoor.com",
	"https://ziprecruiter.com",
	"https://m.facebook.com",
	"https://caburntelecom.com",
	"https://ideas.repec.org",
	"https://healthcare.cardiologymeeting.com",
	"https://linkedin.com",
	"https://openpr.com",
	"https://sourcesecurity.com",
	"https://securityinformed.com",
	"https://cureus.com",
	"https://hngnews.com",
	"https://jobs.aarp.org",
	"https://hannah.com",
	"https://facebook.com",
	"https://miami.craigslist.org",
	"https://sanfordcareers.com",
	"https://myallamericancare.com",
	"https://visitingangels.com",
	"https://vacareers.va.gov",
	"https://homechoicehomecare.com",
	"https://amadaseniorcare.com",
	"https://comfortkeepers.jobs",
	"https://mercifulhandsstaffing.com",
	"https://jobs.cooperhealth.org",
	"https://jobs.cvshealth.com",
	"https://jobs.startribune.com",
	"https://bankrate.com",
	"https://careers.elevancehealth.com",
	"https://www.gasworld.com",
	"https://leadiq.com",
	"https://www.thefranchisehotlist.com",
	"https://www.trustpilot.com",
	"https://www.yelp.com",
	"https://houstontx.gov",
	"https://www.biggerpockets.com",
	"https://www.noradarealestate.com",
	"https://www.concordseminars.com",
	"https://www.wtwco.com",
	"https://www.mnhs.org",
	"https://www.globalfamilydoctor.com",
];

export const MAX_TOKENS = 10000;
