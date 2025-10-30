
document
	.getElementById("logout")
	.addEventListener("click", () => (location.href = "/auth/logout"));
(async function () {
	// ----- config -----
	const API = "/api/emails";
	const DEBOUNCE_MS = 180;

	// ----- state -----
	let emails = [];
	let filtered = [];
	let selected = new Map(); // id -> email object
	let activeIndex = -1;

	// ----- DOM -----
	const input = document.getElementById("search");
	const dropdown = document.getElementById("dropdown");
	const selectedList = document.getElementById("selectedList");

	// ----- helpers -----
	const debounce = (fn, ms) => {
		let t;
		return (...args) => {
			clearTimeout(t);
			t = setTimeout(() => fn(...args), ms);
		};
	};

	function renderDropdown() {
		if (!filtered.length) {
			dropdown.innerHTML = '<div class="no-results">No results</div>';
			dropdown.hidden = false;
			return;
		}
		dropdown.innerHTML = filtered
			.map((e, i) => {
				const disabled = selected.has(e.id)
					? 'aria-disabled="true" style="opacity:.6;pointer-events:none;"'
					: "";
				return `
						<div class="item" data-id="${e.id}" role="option" ${disabled}>
							<strong>${escapeHtml(e.sponsor)}</strong>
							<span class="muted">&lt;${escapeHtml(e.email)}&gt;</span>
						</div>
					`;
			})
			.join("");
		const nodes = dropdown.querySelectorAll(".item");
		nodes.forEach((n, i) =>
			n.classList.toggle("active", i === activeIndex)
		);
		dropdown.hidden = false;
	}

	function renderSelectedList() {
		if (selected.size === 0) {
			selectedList.innerHTML =
				'<div class="muted">No recipients selected yet.</div>';
			return;
		}
		selectedList.innerHTML = Array.from(selected.values())
			.map(
				(e) => `
			<div class="chip" data-id="${e.id}">
				<div class="meta">
					<strong>${escapeHtml(e.sponsor)}</strong> <span class="muted">&lt;${escapeHtml(
					e.email
				)}&gt;</span><br>
					</div>
					<button aria-label="Remove ${escapeHtml(e.name)}" data-id="${e.id
					}">Remove</button>
					</div>
					`
			)
			.join("");

		selectedList.querySelectorAll("button").forEach((btn) => {
			btn.addEventListener("click", (ev) => {
				const id = ev.currentTarget.dataset.id;
				selected.delete(id);
				renderSelectedList();
				// filterAndRender(input.value);
			});
		});
	}

	function escapeHtml(s = "") {
		return String(s).replace(
			/[&<>"']/g,
			(ch) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			}[ch])
		);
	}

	function filterAndRender(query) {
		const q = String(query || "")
			.trim()
			.toLowerCase();
		if (!q) {
			// default: show first 20, excluding selected
			filtered = emails.filter((e) => !selected.has(e.id)).slice(0, 20);
		} else {
			filtered = emails
				.filter((e) => {
					if (selected.has(e.id)) return false; // hide already selected
					return (
						(e.sponsor || "").toLowerCase().includes(q) ||
						(e.email || "").toLowerCase().includes(q)
					);
				})
				.slice(0, 50); // cap results
		}
		activeIndex = filtered.length ? 0 : -1;
		renderDropdown();
	}

	// ----- keyboard nav handlers -----
	input.addEventListener("keydown", (ev) => {
		if (dropdown.hidden) return;
		const nodes = dropdown.querySelectorAll(".item");
		if (!nodes.length) return;
		if (ev.key === "ArrowDown") {
			ev.preventDefault();
			activeIndex = Math.min(activeIndex + 1, nodes.length - 1);
			nodes.forEach((n, i) =>
				n.classList.toggle("active", i === activeIndex)
			);
			nodes[activeIndex].scrollIntoView({ block: "nearest" });
		} else if (ev.key === "ArrowUp") {
			ev.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
			nodes.forEach((n, i) =>
				n.classList.toggle("active", i === activeIndex)
			);
			nodes[activeIndex].scrollIntoView({ block: "nearest" });
		} else if (ev.key === "Enter") {
			ev.preventDefault();
			if (activeIndex >= 0 && activeIndex < filtered.length) {
				pickEmail(filtered[activeIndex].id);
			}
		} else if (ev.key === "Escape") {
			dropdown.hidden = true;
		}
	});

	// ----- click to pick -----
	dropdown.addEventListener("click", (ev) => {
		const item = ev.target.closest(".item");
		if (!item) return;
		const id = item.dataset.id;
		if (id) pickEmail(id);
	});

	function pickEmail(id) {
		const e = emails.find((x) => x.id === id);
		if (!e) return;
		if (selected.has(e.id)) return; // should not happen because we hide selected in dropdown
		selected.set(e.id, e);
		renderSelectedList();
		input.value = "";
		dropdown.hidden = true;
	}

	// ----- blur behavior: close dropdown after small delay so click registers -----
	input.addEventListener("blur", () =>
		setTimeout(() => {
			dropdown.hidden = true;
		}, 150)
	);
	input.addEventListener("focus", () => {
		filterAndRender(input.value);
	});

	// ----- search with debounce -----
	const debouncedFilter = debounce(
		(val) => filterAndRender(val),
		DEBOUNCE_MS
	);
	input.addEventListener("input", (ev) => {
		debouncedFilter(ev.target.value);
	});

	// ----- load emails from server -----
	try {
		const resp = await fetch(API);
		if (!resp.ok) throw new Error("fetch failed: " + resp.status);
		const data = await resp.json();
		emails = data.Sponsor_emails;
	} catch (err) {
		console.error("Could not load emails:", err);
		dropdown.innerHTML =
			'<div class="no-results">Failed to load emails. Try reloading the page.</div>';
		dropdown.hidden = false;
		return;
	}

	// initial render
	renderSelectedList();
	filterAndRender("");
})();