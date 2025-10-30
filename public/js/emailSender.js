
export async function sendAssignmentsToServer() {
	const assignments_file = "email_template_assignments_v1";
	const raw = localStorage.getItem(assignments_file);
	if (!raw) return alert("No assignments found in localStorage.");

	let assignments = {};
	try {
		assignments = JSON.parse(raw);
	} catch (e) {
		return alert("Saved assignments malformed.");
	}

	const selectedContainer = document.getElementById("selectedList");
	const idToEmail = {};
	if (selectedContainer) {
		selectedContainer.querySelectorAll(".chip[data-id]").forEach((chip) => {
			const id = chip.dataset.id;
			// metadata formatting: <strong>Name</strong> <span class="muted">&lt;email&gt;</span>
			const muted = chip.querySelector(".meta .muted");
			const emailText = muted
				? muted.textContent.replace(/[<>]/g, "").trim()
				: null;
			if (id && emailText) idToEmail[id] = emailText;
		});
	}

	// server expects: {assignments: {"email": ["tpl1","tpl2"], ... } }
	const payload = { assignments: {} };
	for (const [id, tplIds] of Object.entries(assignments)) {
		const email = idToEmail[id];
		if (!email) {
			console.warn("Could not map id to email:", id);
			continue;
		}
		payload.assignments[email] = Array.isArray(tplIds) ? tplIds : [];
	}

	if (!Object.keys(payload.assignments).length) {
		return alert(
			"No valid recipient-email mappings found for current selection. Make sure your recipients are selected."
		);
	}

	try {
		const statusEl =
			document.getElementById("status") || document.createElement("div");
		statusEl.innerText = "Sending...";
		const resp = await fetch("/api/send_messages", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		const data = await resp.json();
		if (!resp.ok) {
			console.error("Send failed", data);
			statusEl.innerText =
				"Send failed: " +
				(data && data.message ? data.message : resp.statusText);
			return;
		}
		console.log("Send result", data);
		statusEl.innerText = `Sent: ${data.success}, Failed: ${data.failed}. See console for details.`;
		alert(
			`Send complete. Success: ${data.success}, Failed: ${data.failed}`
		);
	} catch (err) {
		console.error("Network/send error:", err);
		alert("Network error while sending. See console for details.");
	}
}

// const button = document.getElementById("sendAssignments");
// button.addEventListener("click", () => {
// 	if (!confirm("Send all emails? This cannot be undone, please make sure")) return;
// 	sendAssignmentsToServer();
// });