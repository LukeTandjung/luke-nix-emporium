import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	type Focusable,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

type EditApprovalMode = "free" | "review";
type Result<T, E extends Error> = T | E;

interface PersistedModeState {
	mode: EditApprovalMode;
}

interface DiffStats {
	additions: number;
	removals: number;
	lines: number;
}

interface ApprovalPreview {
	operation: "edit" | "write";
	path: string;
	diffText: string;
	diffLines: Array<string>;
	stats: DiffStats;
	note?: string;
	isNewFile: boolean;
}

interface AcceptDecision {
	action: "accept";
}

interface RejectDecision {
	action: "reject";
	reason: string;
}

type ReviewDecision = AcceptDecision | RejectDecision;

interface DiffTextResult {
	diffText: string;
	note?: string;
}

const DEFAULT_MODE: EditApprovalMode = "review";
const MODE_STATE_PATH = join(getAgentDir(), "edit-approval-mode.json");
const STATUS_KEY = "edit-approval-mode";
const REVIEW_VIEWPORT_LINES = 18;
const PAGE_SIZE = 10;
const DIFF_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function isEditApprovalMode(value: string | undefined): value is EditApprovalMode {
	return value === "free" || value === "review";
}

function getStringField(value: unknown, field: string): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const fieldValue = Reflect.get(value, field);
	return typeof fieldValue === "string" ? fieldValue : undefined;
}

function loadMode(): EditApprovalMode {
	if (!existsSync(MODE_STATE_PATH)) {
		return DEFAULT_MODE;
	}

	try {
		const fileContent = readFileSync(MODE_STATE_PATH, "utf8");
		const parsed: unknown = JSON.parse(fileContent);
		const mode = getStringField(parsed, "mode");
		return isEditApprovalMode(mode) ? mode : DEFAULT_MODE;
	} catch {
		return DEFAULT_MODE;
	}
}

function saveMode(mode: EditApprovalMode): Error | undefined {
	try {
		mkdirSync(dirname(MODE_STATE_PATH), { recursive: true });
		const state: PersistedModeState = { mode };
		writeFileSync(MODE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
		return undefined;
	} catch (error: unknown) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

function normalizePath(toolPath: string): string {
	return toolPath.startsWith("@") ? toolPath.slice(1) : toolPath;
}

function resolveRequestedPath(
	cwd: string,
	toolPath: string,
): {
	absolutePath: string;
	displayPath: string;
} {
	const normalizedPath = normalizePath(toolPath);
	return {
		absolutePath: resolve(cwd, normalizedPath),
		displayPath: normalizedPath,
	};
}

function splitLines(text: string): Array<string> {
	if (text.length === 0) {
		return [];
	}

	return text.replace(/\r\n/g, "\n").split("\n");
}

function readTextIfExists(path: string): Result<string | undefined, Error> {
	try {
		if (!existsSync(path)) {
			return undefined;
		}

		return readFileSync(path, "utf8");
	} catch (error: unknown) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

function countOccurrences(source: string, target: string): number {
	if (target.length === 0) {
		return 0;
	}

	let count = 0;
	let searchFrom = 0;

	while (searchFrom <= source.length) {
		const nextIndex = source.indexOf(target, searchFrom);
		if (nextIndex === -1) {
			return count;
		}

		count += 1;
		searchFrom = nextIndex + target.length;
	}

	return count;
}

function replaceFirstOccurrence(source: string, oldText: string, newText: string): string {
	const matchIndex = source.indexOf(oldText);
	if (matchIndex === -1) {
		return source;
	}

	return `${source.slice(0, matchIndex)}${newText}${source.slice(matchIndex + oldText.length)}`;
}

function buildFallbackDiff(beforeContent: string, afterContent: string, displayPath: string): string {
	const lines: Array<string> = [`--- a/${displayPath}`, `+++ b/${displayPath}`, "@@ preview @@"];

	splitLines(beforeContent).forEach((line) => {
		lines.push(`-${line}`);
	});

	splitLines(afterContent).forEach((line) => {
		lines.push(`+${line}`);
	});

	return lines.join("\n");
}

function buildDiffText(beforeContent: string, afterContent: string, displayPath: string): DiffTextResult {
	const tempDirectory = mkdtempSync(join(tmpdir(), "pi-edit-approval-"));
	const beforePath = join(tempDirectory, "before.txt");
	const afterPath = join(tempDirectory, "after.txt");

	try {
		writeFileSync(beforePath, beforeContent, "utf8");
		writeFileSync(afterPath, afterContent, "utf8");

		const result = spawnSync(
			"diff",
			["-u", "-L", `a/${displayPath}`, "-L", `b/${displayPath}`, beforePath, afterPath],
			{
				encoding: "utf8",
				maxBuffer: DIFF_MAX_BUFFER_BYTES,
			},
		);

		if (result.error || (typeof result.status === "number" && result.status > 1)) {
			return {
				diffText: buildFallbackDiff(beforeContent, afterContent, displayPath),
				note: "Using a fallback preview because the local diff command was unavailable or returned an error.",
			};
		}

		const stdout = typeof result.stdout === "string" ? result.stdout.replace(/\r\n/g, "\n") : "";
		return { diffText: stdout.trimEnd() };
	} catch {
		return {
			diffText: buildFallbackDiff(beforeContent, afterContent, displayPath),
			note: "Using a fallback preview because the diff preview could not be generated.",
		};
	} finally {
		rmSync(tempDirectory, { recursive: true, force: true });
	}
}

function combineNotes(...notes: Array<string | undefined>): string | undefined {
	const combined = notes.filter((note): note is string => typeof note === "string" && note.length > 0).join(" ");
	return combined.length > 0 ? combined : undefined;
}

function getDiffStats(diffText: string): DiffStats {
	const diffLines = splitLines(diffText);
	const additions = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
	const removals = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;

	return {
		additions,
		removals,
		lines: diffLines.length,
	};
}

function buildEditPreview(
	cwd: string,
	path: string,
	edits: Array<{ oldText: string; newText: string }>,
): Result<ApprovalPreview, Error> {
	const { absolutePath, displayPath } = resolveRequestedPath(cwd, path);
	const currentFileContents = readTextIfExists(absolutePath);
	if (currentFileContents instanceof Error) {
		return currentFileContents;
	}

	const notes: Array<string> = [];
	let workingContent = typeof currentFileContents === "string" ? currentFileContents : undefined;

	for (const { oldText, newText } of edits) {
		if (typeof workingContent === "string") {
			const occurrenceCount = countOccurrences(workingContent, oldText);
			if (occurrenceCount === 1) {
				workingContent = replaceFirstOccurrence(workingContent, oldText, newText);
			} else if (occurrenceCount === 0) {
				notes.push("Preview may be inaccurate: the current file does not contain oldText exactly. The edit tool may still fail.");
			} else {
				notes.push(`Preview may be inaccurate: oldText appears ${occurrenceCount} times in the current file.`);
			}
		} else {
			notes.push("Preview is based on the requested replacement snippet because the target file does not exist yet. The edit tool may still fail.");
		}
	}

	const beforeContent = typeof currentFileContents === "string" ? currentFileContents : (edits[0]?.oldText ?? "");
	const afterContent = workingContent ?? (edits[0]?.newText ?? "");

	const diffTextResult = buildDiffText(beforeContent, afterContent, displayPath);
	const diffLines = splitLines(diffTextResult.diffText);

	return {
		operation: "edit",
		path: displayPath,
		diffText: diffTextResult.diffText,
		diffLines,
		stats: getDiffStats(diffTextResult.diffText),
		note: combineNotes(...notes, diffTextResult.note),
		isNewFile: false,
	};
}

function buildWritePreview(cwd: string, path: string, content: string): Result<ApprovalPreview, Error> {
	const { absolutePath, displayPath } = resolveRequestedPath(cwd, path);
	const currentFileContents = readTextIfExists(absolutePath);
	if (currentFileContents instanceof Error) {
		return currentFileContents;
	}

	const beforeContent = typeof currentFileContents === "string" ? currentFileContents : "";
	const afterContent = content;
	const diffTextResult = buildDiffText(beforeContent, afterContent, displayPath);
	const diffLines = splitLines(diffTextResult.diffText);
	const isNewFile = currentFileContents === undefined;

	return {
		operation: "write",
		path: displayPath,
		diffText: diffTextResult.diffText,
		diffLines,
		stats: getDiffStats(diffTextResult.diffText),
		note: combineNotes(isNewFile ? "This write will create a new file." : undefined, diffTextResult.note),
		isNewFile,
	};
}

function normalizeReason(reason: string): string {
	return reason.replace(/\s+/g, " ").trim();
}

function wrapPlainText(text: string, width: number): Array<string> {
	if (width <= 0) {
		return [""];
	}

	const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
	const wrappedLines: Array<string> = [];

	paragraphs.forEach((paragraph) => {
		if (paragraph.length === 0) {
			wrappedLines.push("");
			return;
		}

		let remainingParagraph = paragraph;
		while (remainingParagraph.length > width) {
			const slice = remainingParagraph.slice(0, width + 1);
			const lastSpaceIndex = slice.lastIndexOf(" ");
			const breakIndex = lastSpaceIndex > 0 ? lastSpaceIndex : width;
			wrappedLines.push(remainingParagraph.slice(0, breakIndex));
			remainingParagraph = remainingParagraph.slice(breakIndex).trimStart();
		}

		wrappedLines.push(remainingParagraph);
	});

	return wrappedLines;
}

function fitToWidth(text: string, width: number): string {
	if (width <= 0) {
		return "";
	}

	const truncated = truncateToWidth(text, width, "...", true);
	return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}

function styleDiffLine(theme: Theme, line: string): string {
	if (line.startsWith("+") && !line.startsWith("+++")) {
		return theme.fg("toolDiffAdded", line);
	}

	if (line.startsWith("-") && !line.startsWith("---")) {
		return theme.fg("toolDiffRemoved", line);
	}

	if (line.startsWith("@@")) {
		return theme.fg("accent", line);
	}

	if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
		return theme.fg("muted", line);
	}

	return theme.fg("toolDiffContext", line);
}

function reviewTitle(preview: ApprovalPreview): string {
	if (preview.operation === "write" && preview.isNewFile) {
		return "Review create";
	}

	return preview.operation === "write" ? "Review write" : "Review edit";
}

class EditApprovalDialog implements Focusable {
	private readonly editor: Editor;
	private readonly viewportLines = REVIEW_VIEWPORT_LINES;
	private readonly previewNote?: string;
	private stage: "review" | "reason" = "review";
	private scrollOffset = 0;
	private validationMessage?: string;
	private cachedWidth?: number;
	private cachedLines?: Array<string>;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly preview: ApprovalPreview,
		private readonly done: (decision: ReviewDecision) => void,
	) {
		const editorTheme: EditorTheme = {
			borderColor: (text) => this.theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => this.theme.fg("accent", text),
				selectedText: (text) => this.theme.fg("accent", text),
				description: (text) => this.theme.fg("muted", text),
				scrollInfo: (text) => this.theme.fg("dim", text),
				noMatch: (text) => this.theme.fg("warning", text),
			},
		};

		this.editor = new Editor(this.tui, editorTheme);
		this.editor.onSubmit = (value) => {
			const normalized = normalizeReason(value);
			if (normalized.length === 0) {
				this.validationMessage = "A rejection reason is required.";
				this.requestRender();
				return;
			}

			this.done({ action: "reject", reason: normalized });
		};

		this.previewNote = preview.note;
	}

	private requestRender(): void {
		this.invalidate();
		this.tui.requestRender();
	}

	private maxScrollOffset(): number {
		return Math.max(0, this.preview.diffLines.length - this.viewportLines);
	}

	private moveScroll(delta: number): void {
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, this.maxScrollOffset()));
		this.requestRender();
	}

	handleInput(data: string): void {
		if (this.stage === "reason") {
			if (matchesKey(data, Key.escape)) {
				this.stage = "review";
				this.validationMessage = undefined;
				this.requestRender();
				return;
			}

			this.validationMessage = undefined;
			this.editor.handleInput(data);
			this.requestRender();
			return;
		}

		if (matchesKey(data, "1")) {
			this.done({ action: "accept" });
			return;
		}

		if (matchesKey(data, "2") || matchesKey(data, Key.escape)) {
			this.stage = "reason";
			this.validationMessage = undefined;
			this.requestRender();
			return;
		}

		if (matchesKey(data, Key.up)) {
			this.moveScroll(-1);
			return;
		}

		if (matchesKey(data, Key.down)) {
			this.moveScroll(1);
			return;
		}

		if (matchesKey(data, "pageUp")) {
			this.moveScroll(-PAGE_SIZE);
			return;
		}

		if (matchesKey(data, "pageDown")) {
			this.moveScroll(PAGE_SIZE);
			return;
		}

		if (matchesKey(data, Key.home)) {
			this.scrollOffset = 0;
			this.requestRender();
			return;
		}

		if (matchesKey(data, Key.end)) {
			this.scrollOffset = this.maxScrollOffset();
			this.requestRender();
		}
	}

	render(width: number): Array<string> {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const innerWidth = Math.max(20, width - 2);
		const border = (text: string) => this.theme.fg("border", text);
		const row = (text = "") => `${border("│")}${fitToWidth(text, innerWidth)}${border("│")}`;
		const lines: Array<string> = [];
		const wrappedNoteLines = this.previewNote ? wrapPlainText(this.previewNote, innerWidth) : [];
		const noteLines = wrappedNoteLines.slice(0, 3);
		const summaryLine = `${this.theme.fg("toolDiffAdded", `+${this.preview.stats.additions}`)} ${this.theme.fg("toolDiffRemoved", `-${this.preview.stats.removals}`)} ${this.theme.fg("muted", `(${this.preview.stats.lines} diff lines)`)} `;

		lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
		lines.push(row(`${this.theme.fg("accent", this.theme.bold(reviewTitle(this.preview)))} ${this.theme.fg("accent", this.preview.path)}`));
		lines.push(row(summaryLine));

		noteLines.forEach((noteLine) => {
			lines.push(row(this.theme.fg("warning", noteLine)));
		});

		if (wrappedNoteLines.length > noteLines.length) {
			lines.push(row(this.theme.fg("warning", "...")));
		}

		lines.push(row());

		if (this.stage === "review") {
			const totalLines = this.preview.diffLines.length;
			const startLine = totalLines === 0 ? 0 : this.scrollOffset + 1;
			const endLine = totalLines === 0 ? 0 : Math.min(totalLines, this.scrollOffset + this.viewportLines);
			const diffHeader =
				totalLines === 0
					? "Diff preview (no textual changes)"
					: `Diff preview ${startLine}-${endLine} of ${totalLines}`;

			lines.push(row(this.theme.fg("muted", diffHeader)));

			const visibleDiffLines = this.preview.diffLines.slice(this.scrollOffset, this.scrollOffset + this.viewportLines);
			if (visibleDiffLines.length === 0) {
				lines.push(row(this.theme.fg("muted", "(no textual changes)")));
			}

			visibleDiffLines.forEach((line) => {
				lines.push(row(styleDiffLine(this.theme, line)));
			});

			for (let index = visibleDiffLines.length; index < this.viewportLines; index += 1) {
				lines.push(row());
			}

			lines.push(row());
			lines.push(
				row(this.theme.fg("dim", "1 accept • 2 reject • ↑↓ scroll • PgUp/PgDn page • Esc reject")),
			);
		} else {
			lines.push(row(this.theme.fg("warning", this.theme.bold("Rejection reason required"))));
			lines.push(row(this.theme.fg("muted", "This reason will be returned to the model.")));
			lines.push(row());

			wrapPlainText("Why are you rejecting this change?", innerWidth).forEach((line) => {
				lines.push(row(this.theme.fg("text", line)));
			});

			lines.push(row());
			this.editor.render(Math.max(10, innerWidth - 2)).forEach((line) => {
				lines.push(row(` ${line}`));
			});

			if (this.validationMessage) {
				lines.push(row());
				lines.push(row(this.theme.fg("error", this.validationMessage)));
			}

			lines.push(row());
			lines.push(row(this.theme.fg("dim", "Enter submit rejection • Esc back")));
		}

		lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.editor.invalidate();
	}
}

function updateStatus(ctx: ExtensionContext, mode: EditApprovalMode): void {
	ctx.ui.setStatus(STATUS_KEY, `edit:${mode}`);
}

async function requestApproval(
	ctx: ExtensionContext,
	preview: ApprovalPreview,
): Promise<Result<ReviewDecision, Error>> {
	if (!ctx.hasUI) {
		return new Error("Edit review mode is enabled, but no interactive UI is available for approval.");
	}

	try {
		const decision = await ctx.ui.custom<ReviewDecision | undefined>((tui, theme, _keybindings, done) => {
			return new EditApprovalDialog(tui, theme, preview, done);
		});

		if (!decision) {
			return new Error("The approval dialog closed without an explicit decision.");
		}

		return decision;
	} catch (error: unknown) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

function applyMode(nextMode: EditApprovalMode, ctx: ExtensionContext, state: { mode: EditApprovalMode }): void {
	state.mode = nextMode;
	updateStatus(ctx, state.mode);

	const saveError = saveMode(state.mode);
	if (saveError) {
		ctx.ui.notify(`Edit mode changed to ${state.mode}, but persisting it failed: ${saveError.message}`, "warning");
		return;
	}

	ctx.ui.notify(`Edit mode: ${state.mode}`, "info");
}

export default function editApprovalModeExtension(pi: ExtensionAPI): void {
	const state: { mode: EditApprovalMode } = { mode: loadMode() };

	pi.registerCommand("edit-mode", {
		description: "Switch file edit approval mode (free or review)",
		handler: async (args, ctx) => {
			const requestedMode = args?.trim().toLowerCase() ?? "";

			if (requestedMode.length === 0) {
				if (!ctx.hasUI) {
					ctx.ui.notify(`Edit mode: ${state.mode}`, "info");
					return;
				}

				const selection = await ctx.ui.select("Select edit mode", ["review", "free"]);
				if (!selection) {
					ctx.ui.notify(`Edit mode: ${state.mode}`, "info");
					return;
				}

				applyMode(selection === "free" ? "free" : "review", ctx, state);
				return;
			}

			if (requestedMode === "status") {
				ctx.ui.notify(`Edit mode: ${state.mode}`, "info");
				return;
			}

			if (requestedMode === "toggle") {
				applyMode(state.mode === "review" ? "free" : "review", ctx, state);
				return;
			}

			if (!isEditApprovalMode(requestedMode)) {
				ctx.ui.notify(
					`Unknown edit mode \"${requestedMode}\". Use /edit-mode free, /edit-mode review, /edit-mode toggle, or /edit-mode status.`,
					"warning",
				);
				return;
			}

			applyMode(requestedMode, ctx, state);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		state.mode = loadMode();
		updateStatus(ctx, state.mode);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (state.mode !== "review") {
			return undefined;
		}

		const preview = isToolCallEventType("edit", event)
			? buildEditPreview(ctx.cwd, event.input.path, event.input.edits)
			: isToolCallEventType("write", event)
				? buildWritePreview(ctx.cwd, event.input.path, event.input.content)
				: undefined;

		if (!preview) {
			return undefined;
		}

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `${event.toolName} blocked because edit review mode is enabled and no interactive UI is available. Use /edit-mode free to disable approvals.`,
			};
		}

		if (preview instanceof Error) {
			ctx.ui.notify(`Could not build ${event.toolName} preview: ${preview.message}`, "error");
			return {
				block: true,
				reason: `${event.toolName} blocked because the approval preview could not be generated: ${preview.message}`,
			};
		}

		const decision = await requestApproval(ctx, preview);
		if (decision instanceof Error) {
			ctx.ui.notify(`Approval dialog failed: ${decision.message}`, "error");
			return {
				block: true,
				reason: `${event.toolName} blocked because the approval dialog failed: ${decision.message}`,
			};
		}

		if (decision.action === "reject") {
			return {
				block: true,
				reason: `Rejected by user for ${preview.path}: ${decision.reason}`,
			};
		}

		return undefined;
	});
}
