import { sendAssignmentsToServer } from "./emailSender.js"

(async function () {
	// ----- config -----
	const API = "/api/email_templates";
	const DEBOUNCE_MS = 180;

	// ----- state -----
	let templates = [];
	let filtered = [];
	let selected = new Map(); // id -> email object
	let activeIndex = -1;

	// ----- DOM -----
	const templatesRoot = document.getElementById("templates");

	if (!templatesRoot) {
		console.error("Template root not found");
		return;
	}

	const templateControls = document.createElement("div");
	templateControls.style.margin = "8px";
	templateControls.style.display = "flex";
	templateControls.style.flexDirection = "column";
	templateControls.style.gap = "12px";

	const cardArea = document.createElement("div");
	cardArea.style.display = "flex";
	cardArea.style.flexWrap = "wrap";
	cardArea.style.gap = "8";
	cardArea.setAttribute("aria-label", "Template List");

	// Instructions
	const instructions = document.createElement("label");
	instructions.style.fontSize = "13px";
	// instructions.style.color = "#333";
	instructions.innerText =
		"Select template chips (click) to choose template(s). Then click a selected recipient below to assign.";

	// selected emails list
	const assignArea = document.createElement("div");
	assignArea.style.display = "flex";
	assignArea.style.flexDirection = "column";
	assignArea.style.gap = "8px";
	assignArea.style.marginTop = "8px";
	assignArea.style.cursor = "pointer";

	const controlsRow = document.createElement("div");
	controlsRow.style.display = "flex";
	controlsRow.style.gap = "8px";
	controlsRow.style.alignItems = "center";

	const refreshBtn = document.createElement("button");
	refreshBtn.textContent = "Refresh selected recipients";
	refreshBtn.style.cursor = "pointer";
	refreshBtn.className = "primary";

	const clearAssignmentsBtn = document.createElement("button");
	clearAssignmentsBtn.textContent = "Clear all assignments";
	clearAssignmentsBtn.style.cursor = "pointer";
	clearAssignmentsBtn.className = "primary";

	const assignToAllBtn = document.createElement("button");
	assignToAllBtn.textContent = "Assign selected template to all recipients";
	assignToAllBtn.style.cursor = "pointer";
	assignToAllBtn.className = "primary";

	controlsRow.appendChild(refreshBtn);
	controlsRow.appendChild(clearAssignmentsBtn);
	controlsRow.appendChild(assignToAllBtn);

	templateControls.appendChild(instructions);
	templateControls.appendChild(cardArea);
	templateControls.appendChild(controlsRow);
	templateControls.appendChild(assignArea);

	templatesRoot.innerHTML = "";
	templatesRoot.appendChild(templateControls);

	//  escape utility
	const esc = (s = "") =>
		String(s).replace(
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

	try {
		const resp = await fetch(API);
		if (!resp.ok) throw new Error("fetch failed: " + resp.status);
		const data = await resp.json();
		templates = data.Email_Templates;
	} catch (err) {
		console.error("Could not load templates:", err);
		cardArea.innerHTML =
			'<div class="muted">Failed to load templates.</div>';
		return;
	}

	let selectedTemplateId = -1;

	function renderTemplateCards() {
		cardArea.innerHTML = "";
		templates.forEach((t) => {
			const chip = document.createElement("button");
			chip.className = "tpl-chip";
			chip.dataset.tplId = t.id;
			chip.innerHTML = `<strong>${esc(t.name)}</strong>`;
			if (selectedTemplateId == t.id) {
				chip.className = "tpl-chip selected"
			}
			chip.addEventListener("click", (ev) => {
				ev.preventDefault();
				const id = chip.dataset.tplId;
				if (selectedTemplateId == id) selectedTemplateId = -1;
				else selectedTemplateId = id;
				renderTemplateCards();
				updateInstructions();
			});
			chip.title = t.name ? t.name.substring(0, 500) : "";
			cardArea.appendChild(chip);
		});
	}

	function updateInstructions() {
		if (selectedTemplateId == -1) {
			instructions.innerText =
				"Click template chips to select template(s). Then click a recipient below to assign.";
		} else if (selectedTemplateId > -1) {
			instructions.innerText = `Template selected (${selectedTemplateId}). Click a recipient to assign / toggle it.`;
		}
	}

	// Assignments storage (local): map of emailId -> array of templateIds (persisted)
	const STORAGE_KEY = "email_template_assignments_v1";
	function loadAssignments() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch (e) {
			return {};
		}
	}

	function saveAssignments(obj) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(obj || {}));
	}

	let assignments = loadAssignments();

	// Helper: read selected recipients directly from DOM (existing selected chips)
	function readSelectedRecipientsFromDOM() {
		const container = document.getElementById("selectedList");
		if (!container) return [];
		// chips use data-id attribute (as in your markup)
		const chips = container.querySelectorAll(".chip[data-id]");
		const out = [];
		chips.forEach((ch) => {
			const id = ch.dataset.id;
			const name = ch.querySelector(".meta strong")
				? ch.querySelector(".meta strong").innerText
				: "";
			const emailMatch = ch.querySelector(".meta .muted")
				? ch.querySelector(".meta .muted").innerText
				: "";
			const email = emailMatch.replace(/[<>]/g, "").trim();
			out.push({ id, name, email });
		});
		return out;
	}

	function renderAssignmentsUI() {
		assignArea.innerHTML = "";
		const recipients = readSelectedRecipientsFromDOM();
		if (!recipients.length) {
			assignArea.innerHTML =
				'<div class="muted">No recipients selected. Pick recipients above to assign templates.</div>';
			return;
		}

		// header row
		const header = document.createElement("div");
		header.style.display = "flex";
		header.style.gap = "12px";
		header.style.alignItems = "center";
		header.style.fontWeight = "600";
		header.innerHTML = `<div style="width:260px">Recipient</div><div>Assigned templates</div>`;
		assignArea.appendChild(header);

		recipients.forEach((r) => {
			const row = document.createElement("div");
			row.className = "chip"

			const rInfo = document.createElement("div");
			rInfo.style.width = "260px";
			rInfo.innerHTML = `<strong>${esc(
				r.name
			)}</strong> <span class="muted">&lt;${esc(r.email)}&gt;</span>`;

			const assArea = document.createElement("div");
			assArea.style.display = "flex";
			assArea.style.flexWrap = "wrap";
			assArea.style.gap = "6px";

			const assignedForThis = assignments[r.id] ?? [];

			// render assigned template chips with remove button
			if (!assignedForThis.length) {
				assArea.innerHTML =
					'<span class="muted">No templates assigned</span>';
			} else {
				assignedForThis.forEach((tid) => {
					const tpl = templates.find((x) => x.id === tid);
					const chip = document.createElement("div");
					chip.className = "chip"
					chip.innerHTML = `<span style="font-size:13px">${esc(
						tpl ? tpl.name : tid
					)}</span>`;
					const rem = document.createElement("button");
					rem.textContent = "✕";
					rem.style.marginLeft = "8px";
					rem.style.border = "none";
					rem.style.background = "transparent";
					rem.style.cursor = "pointer";
					rem.title = "Remove assignment";
					rem.addEventListener("click", () => {
						assignments[r.id] = (assignments[r.id] || []).filter(
							(x) => x !== tid
						);
						if (!assignments[r.id].length) delete assignments[r.id];
						saveAssignments(assignments);
						renderAssignmentsUI();
					});
					chip.appendChild(rem);
					assArea.appendChild(chip);
				});
			}

			// !todo: restrict if people can send "conflicting" emails for the same cause to the same person (you can send an email protesting hart and quenneville to the same person, but not two hart to the same person)
			// Make the entire row clickable to assign currently-selected template
			row.addEventListener("click", (ev) => {
				// ignore clicks on remove buttons (they have button tag)
				if (ev.target.tagName.toLowerCase() === "button") return;
				if (selectedTemplateId == -1) {
					return;
				}
				// this enables multiple assignments per recipient, we want to disable it for now
				// assign/toggle selected template for this recipient
				// assignments[r.id] = assignments[r.id] || [];

				// if (assignments[r.id].includes(selectedTemplateId)) {
				// 	// remove assignment
				// 	assignments[r.id] = assignments[r.id].filter((x) => x !== selectedTemplateId);
				// } else {
				// 	// add assignment
				// 	assignments[r.id].push(selectedTemplateId);
				// }
				assignments[r.id] = [];
				assignments[r.id].push(selectedTemplateId);

				// cleanup empty arrays
				if (!assignments[r.id].length) delete assignments[r.id];
				saveAssignments(assignments);
				renderAssignmentsUI();
			});

			row.appendChild(rInfo);
			row.appendChild(assArea);
			assignArea.appendChild(row);
		});

		const payloadBtn = document.createElement("button");
		payloadBtn.textContent = "Prepare send payload (show mapping)";
		payloadBtn.className = "primary";
		// payloadBtn.style.marginTop = "12px";
		payloadBtn.addEventListener("click", () => {
			const mapping = {};
			const recipientsNow = readSelectedRecipientsFromDOM();
			recipientsNow.forEach((r) => {
				mapping[r.email] = assignments[r.id] ?? [];
			});
			// show mapping as pretty JSON in a modal-ish overlay
			const overlay = document.createElement("div");
			overlay.style.position = "fixed";
			overlay.style.left = 0;
			overlay.style.top = 0;
			overlay.style.right = 0;
			overlay.style.bottom = 0;
			overlay.style.background = "rgba(0,0,0,0.35)";
			overlay.style.display = "flex";
			overlay.style.alignItems = "center";
			overlay.style.justifyContent = "center";
			const box = document.createElement("pre");
			box.style.background = "#fff";
			box.style.padding = "18px";
			box.style.borderRadius = "8px";
			box.style.maxWidth = "90%";
			box.style.maxHeight = "80%";
			box.style.overflow = "auto";
			box.textContent = JSON.stringify(mapping, null, 2);
			const close = document.createElement("button");
			close.textContent = "Close";
			close.style.display = "block";
			close.style.marginTop = "12px";
			close.addEventListener("click", () =>
				document.body.removeChild(overlay)
			);
			box.appendChild(close);
			overlay.appendChild(box);
			document.body.appendChild(overlay);
		});

		const sendBtn = document.createElement("button");
		sendBtn.textContent = "Send emails (NON REVERSABLE)";
		sendBtn.className = "primary";
		sendBtn.id = "sendAssignments";
		sendBtn.addEventListener("click", () => {
			sendAssignmentsToServer();
		});
		assignArea.appendChild(sendBtn);
		// assignArea.appendChild(payloadBtn);
	}

	refreshBtn.addEventListener("click", () => {
		// have to re-render here bc of new recipients
		renderAssignmentsUI();
	});
	clearAssignmentsBtn.addEventListener("click", () => {
		if (!confirm("Clear all template assignments?")) return;
		assignments = {};
		saveAssignments(assignments);
		renderAssignmentsUI();
	});
	assignToAllBtn.addEventListener("click", () => {
		const recipients = readSelectedRecipientsFromDOM();
		if (selectedTemplateId == -1 || !recipients.length) return;
		recipients.forEach(r => {
			assignments[r.id] = [selectedTemplateId];
		});
		saveAssignments(assignments);
		renderAssignmentsUI();
	});

	// 👀 changes for re-render
	const selContainer = document.getElementById("selectedList");
	if (selContainer) {
		const mo = new MutationObserver(() => {
			renderAssignmentsUI();
		});
		mo.observe(selContainer, { childList: true, subtree: true });
	}

	renderTemplateCards();
	updateInstructions();
	renderAssignmentsUI();
})();