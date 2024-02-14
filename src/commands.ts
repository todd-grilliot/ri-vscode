import * as vscode from 'vscode';
import ts, { Statement, SyntaxKind } from 'typescript';

type SyntaxKindString = keyof typeof SyntaxKind;

//#region util functions

let __arbIndex = 0;
const generateArbitraryName = () => {
	const index = __arbIndex;
	__arbIndex ++;
	const names = ['foo', 'bar', 'baz', 'qux', 'quux', 'corge', 'grault', 'garply', 'waldo', 'fred', 'plugh', 'xyzzy', 'thud'];
	const suffixes = ['', '_1', '_2', '_3', '_4', '_5', '_6', '_7', '_8', '_9', '_10'];
	const metaIndex = Math.floor( index / names.length );

	const prefix = '_'.repeat(Math.floor(index / (names.length * suffixes.length)));
	const word = names[index % names.length];
	const suffix = suffixes[metaIndex % suffixes.length];

	return prefix + word + suffix;
}

/**
 * Get information from the active editor in VS Code.
 * @returns An object containing:
 * - `doc`: The active text document.
 * - `sourceFile`: The TypeScript source file representation of the document.
 * - `editor`: The active text editor.
 * - `selection`: The current text selection in the editor.
 * - `activePosition`: The active position of the cursor.
 * - `cursorOffset`: The character offset of the cursor in the document.
 */
const getEditorInfo = () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return null;
	const doc = editor.document;
	const filePath = doc.uri.fsPath;
	const fileText = doc.getText();
	const sourceFile = ts.createSourceFile(filePath, fileText, ts.ScriptTarget.ES2015, true);
	const selection = editor.selection;
	const activePosition = selection.active;
	const cursorOffset = doc.offsetAt(activePosition);

	return {
	/** The active text document */
		doc,
	/** The TypeScript source file representation of the document */
		sourceFile,
	/** The active text editor */
		editor,
	/** The current text selection in the editor */
		selection,
	/** The active position of the cursor */
		activePosition,
	/** The character offset of the cursor in the document */
		cursorOffset
	};
};

function calculateIndentationOfLine(line: vscode.TextLine) {
	let tabs = 0;
	let spaces = 0;

	for (const char of line.text) {
		if (char === '\t') tabs++;
		else if (char === ' ') spaces++;
		else break;
	}
	return `${'\t'.repeat(tabs)}${' '.repeat(spaces)}`;
}

function findNodeAtOffset(sourceNode: ts.SourceFile, offset: number) {
	let nodeRef: ts.Node = sourceNode;
	let nodeOffset = 0;
	const lineStarts = sourceNode.getLineStarts();

	function searchTree(node: ts.Node) {
		const name = ts.SyntaxKind[node.kind];
		const parentName = ts.SyntaxKind[node.parent?.kind];

		if (offset >= node.getStart() && offset <= node.getEnd()) {
			nodeRef = node;
			if (parentName === 'Block') nodeOffset = node.getStart();
			if (name === 'Block' || !node.parent) nodeOffset = offset;

			node.forEachChild((child) => searchTree(child));
		}
	}
	searchTree(sourceNode);

	const lineStart =
		lineStarts.find(
			(lineStart, index) =>
				lineStart <= nodeOffset && lineStarts?.[index + 1] > nodeOffset
		) ?? nodeOffset;
	return {
		node: nodeRef,
		safeOffset: lineStart,
	};
}
function searchForMatchingChild(
	node: ts.Node,
	kindArr: SyntaxKindString[],
	useParentAsDefault = false
) {
	let match;

	function search(node, kindArr) {
		node.forEachChild((child) => {
			if (kindArr.includes(ts.SyntaxKind[child.kind] as SyntaxKindString)) {
				return (match = child.getText());
			} else {
				search(child, kindArr);
			}
		});
	}
	search(node, kindArr);

	return match ?? (useParentAsDefault ? node.getText() : `"invalid node"`);
}

function convertOffsetToPos(offset: number, source: ts.SourceFile) {
	const { line, character } = source.getLineAndCharacterOfPosition(offset);
	return new vscode.Position(line, character);
}

function getAllImports(sourceFile: ts.SourceFile) {
	const statements = sourceFile?.statements;
	const imports: ts.NodeArray<ts.ImportDeclaration> = statements.filter(
		(node) => node.kind === ts.SyntaxKind.ImportDeclaration
	) as unknown as ts.NodeArray<ts.ImportDeclaration>;
	return imports;
}

function addNamedImports(names: string[], path: string, importNodes: ts.NodeArray<ts.ImportDeclaration>) {
	console.log('addNamedImport: ', names, path, importNodes);

	const { editor, selection, activePosition, cursorOffset, sourceFile } = getEditorInfo();
	const importString = names.join(', ');
	let workspaceEdit = new vscode.WorkspaceEdit();
	// const searchedImport = importNodes.find((node) => node.moduleSpecifier.getText() === path);
	const searchedImports = importNodes.filter(
		(node) => node.moduleSpecifier.getText().slice(1, -1) === path
	) as unknown as ts.NodeArray<ts.ImportDeclaration>;

	function insertNewImportStatement() {
		//insert whole import statement
		const lastImport = importNodes[importNodes.length - 1];
		const end = lastImport.getEnd();
		const endPos = convertOffsetToPos(end, sourceFile);
		const indentation = calculateIndentationOfLine(editor.document.lineAt(endPos.line));
		workspaceEdit.insert(editor.document.uri, endPos, `\n${indentation}import { ${importString} } from '${path}';`);
	}

	// not sure how i'm going to use this yet. but it needs to be batched into the final edit
	function extractImportsData(importNodes: ts.NodeArray<ts.ImportDeclaration>) {
		if (importNodes.length === 1) console.log('only one import, no need to combine');
		console.log('combineImports!: ');

		const firstImport = importNodes[0];
		const existingImportNamesString = importNodes.reduce((acc, node) => {
			const namedImports = node.importClause.namedBindings.elements.map((node) =>	node.name.getText()	);
			return [...acc, ...namedImports];
		}, []).join(', ');

		const importWithDefault = importNodes.find((node) => node.importClause.name);
		const targetImport = importWithDefault ?? firstImport;
		const namedBindings = targetImport.importClause.namedBindings;
		const targetNamesStart = namedBindings.elements[0].name.getStart();
		const targetNamesEnd = namedBindings.elements[namedBindings.elements.length - 1].name.getEnd();
		const targetImportNameRange = new vscode.Range(
			convertOffsetToPos(targetNamesStart, sourceFile),
			convertOffsetToPos(targetNamesEnd, sourceFile)
		);

		// targetImport.importClause.namedBindings.
		console.log('targetImportNameRange: ', targetImportNameRange, 'getText: ', targetImport.importClause.namedBindings.getText(),);

		// replace the import names with the combined import names on the target import
		// workspaceEdit.replace(editor.document.uri, targetImportNameRange, combinedImportNamesString); // happens later

		// delete all imports except the targetImport
		// double check that the indentation doesn't get messed up here
		const duplicate = importNodes.filter((node) => node !== targetImport);
		// duplicate.forEach((node) => {
		// 	const startPos = convertOffsetToPos(node.getStart(), sourceFile);
		// 	const endPos = convertOffsetToPos(node.getEnd(), sourceFile);
		// 	workspaceEdit.delete(editor.document.uri, new vscode.Range(startPos, endPos));
		// });
		return {targetImport, targetImportNameRange, existingImportNamesString, duplicate};
	}
	const { targetImport, targetImportNameRange, existingImportNamesString, duplicate } = extractImportsData(searchedImports);
	// I got about here. This function is getting unweildy. Good luck finishing it.
	// I"m not even that sure if we still need to filter. but basically we need to batch all the edits.

	if (!searchedImports.length) return insertNewImportStatement();

	// need updating fo searchedIMports plural
	const importClause = targetImport.importClause;
	// const defaultImport = importClause.name;
	const namedImports: ts.Identifier[] = importClause.namedBindings.elements.map(node => node.name);
	const namedImportTexts = namedImports.map(node => node.getText());
	console.log('namedImports: ', namedImports);
	console.log('namedTexts: ', namedImportTexts);
	// filter out the imports that are already imported
	const filteredNames = names.filter(name => !namedImportTexts.includes(name));
	console.log('filteredNames: ', filteredNames);
	if (!filteredNames.length) return; // all names are already imported

	// if (!namedImports.length) return addNames()
	// addOneName();

	vscode.workspace.applyEdit(workspaceEdit);
}

async function findExportsInProject(searchStr: string, program: ts.Program) {
	const sourceFiles = program.getSourceFiles();

	console.log('sourceFiles: ', sourceFiles);

	// sourceFiles.forEach((sourceFile) => {
	// 	ts.forEachChild(sourceFile, (node) => {
	// 		if (ts.isExportDeclaration(node) && node.exportClause) {
	// 			console.log('any');
	// 			// Logic to check if the exportName matches
	// 		}
	// 	});
	// });
}
//#endregion

	// Listen for diagnostic changes ***
	vscode.languages.onDidChangeDiagnostics((event) => {
		// console.log('diagnostics changed!');
		event.uris.forEach((uri) => {
			const diagnostics = vscode.languages.getDiagnostics(uri);
			diagnostics.forEach((diagnostic) => {
				// Filter for TypeScript errors
				if (diagnostic.source === 'ts') {
					// Take action on the TypeScript error
					// console.log('diagnostic msg: ', diagnostic.message, 'diagnostic: ', diagnostic);
					// Additional actions here
				}
			});
		});
	});


export const helloCommand = () => {
	console.log('hello world');
	vscode.window.showInformationMessage('Hello! Welcome to the R.I. VSCode extension!');
}

export const expandCommand = () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	const selection = editor.selection;
	const selectedText = editor.document.getText(selection);
	const line = editor.document.lineAt(selection.active.line);
	const endOfLinePos = line.range.end;
	const indentation = calculateIndentationOfLine(line);
	if (selection.active.isEqual(selection.anchor)){
		vscode.window.showInformationMessage('no selection');
		return;
	}

	editor.edit((editBuilder) => {
		editBuilder.insert(endOfLinePos, `\n${indentation}${selectedText}`);
	});

	vscode.window.showInformationMessage(`Expanding type ${selectedText}`);
};

export const tsCommand = () => {
	const { sourceFile, editor, selection, cursorOffset } = getEditorInfo();

	const { node, safeOffset } = findNodeAtOffset(sourceFile, cursorOffset);
	const safeNodePosition = convertOffsetToPos(safeOffset, sourceFile);
	const indentation = calculateIndentationOfLine(
		editor.document.lineAt(safeNodePosition.line)
	);

	const selectedText = editor?.document.getText(selection);
	const isBlock = node.kind === ts.SyntaxKind.Block || node.parent;
	const autoSelectedText = isBlock
		? `"cannot select node"`
		: searchForMatchingChild(node, ['Identifier'], true);
	const wrappedText = selectedText || autoSelectedText;

	editor.edit((editBuilder) => {
		editBuilder.insert(
			safeNodePosition,
			`type ${generateArbitraryName()} = ExpandRecursively<${wrappedText}>\n${indentation}`
		);
	});

	vscode.window.showInformationMessage(`ts playground finished`);
};

export const importCommand = async () => {
	console.log('importing ri-expo');
	const timestamp = Date.now();
	// '@ri_expo/common'

	const {doc, sourceFile, editor, selection, cursorOffset} = getEditorInfo();

	// const imports = getAllImports(sourceFile);
	const imports = getAllImports(sourceFile);
	addNamedImports(['ExpandRecursively'], `@ri_expo/common`, imports);

	vscode.window.showInformationMessage(`import command finished`);
};





