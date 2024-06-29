export interface PageToScrape {
	url: string;
	type: "client" | "server";
	articleContainerSelector: string;
	linkSelector: string;
	titleSelector: string;
	descriptionSelector: string | undefined;
	dateSelector: string | undefined;
	removeIfNoDate?: boolean;
}

export interface ArticleData {
	link?: string;
	title?: string;
	description?: string;
	date?: Date;
}

export interface ValidArticleData {
	link: string;
	title: string;
	description?: string;
	date?: Date;
}

export interface ValidArticleDataWithCount extends ValidArticleData {
	count: number;
}
