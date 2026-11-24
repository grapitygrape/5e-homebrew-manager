// Hand-written pages carry a copy of the old header; this puts them on the shell's
// app bar and stylesheet. Pure, so build.mjs and export.mjs share it.
const SHELL_LINKS = `<link rel="stylesheet" href="css/shell.css">
	<script src="js/shell-tooltips.js" defer></script>
	<script type="module" src="js/shell-omni-complete.js"></script>

	<!-- Favicons -->`;

const APP_BAR_START = /<div class="ve-flex-col">[\s\S]*?<\/nav>\s*<\/div>/;

export const adoptShell = (html, name = "page") => {
	const header = html.match(APP_BAR_START);
	if (!header) throw new Error(`${name}: header markup not found`);

	const title = header[0].match(/<h1[^>]*>[\s\S]*?<\/h1>/)[0].replace(/ve-no-wrap ve-my-0 ?/, "");
	const subtitle = header[0].match(/<p[^>]*id="page__subtitle"[\s\S]*?<\/p>/)[0].replace(/ve-no-wrap ve-my-0 ?/, "");
	const appBar = `<div class="app-bar">
		<header class="page__header app-bar-title">
			${title}
			${subtitle}
		</header>

		<nav class="page__nav app-bar-nav" id="navigation">
			<ul class="nav nav-pills page__nav-inner" id="navbar"></ul>
		</nav>
	</div>`;

	return html
		.replace(APP_BAR_START, appBar)
		.replace("<!-- Favicons -->", SHELL_LINKS);
};
