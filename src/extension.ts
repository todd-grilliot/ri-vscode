import * as vscode from 'vscode';
import { diagnosticsToCSVCommand, expandCommand, helloCommand, importCommand, listTypescriptErrorsCommand, organizeAllImportsCommand, tsCommand } from './commands';


interface ChatAgentResult extends vscode.ChatAgentResult2 {
	slashCommand: string;
}




export function activate(context: vscode.ExtensionContext) {

	//#region command subscriptions
	console.log('Congratulations, your extension "ri-vscode" is now active!');

	const helloSub = vscode.commands.registerCommand('ri-vscode.helloWorld', helloCommand);
	context.subscriptions.push(helloSub);

	const expandSub = vscode.commands.registerCommand('ri-vscode.expandType', expandCommand);
	context.subscriptions.push(expandSub);

	const tsSub = vscode.commands.registerCommand('ri-vscode.tsPlayground', tsCommand);
	context.subscriptions.push(tsSub);

	const importSub = vscode.commands.registerCommand('ri-vscode.importRIExpo', importCommand);
	context.subscriptions.push(importSub);

	const organizeImportsSub = vscode.commands.registerCommand('ri-vscode.organizeImports', organizeAllImportsCommand);
	context.subscriptions.push(organizeImportsSub);

	const listTypescriptErrorsSub = vscode.commands.registerCommand('ri-vscode.listTypescriptErrors', listTypescriptErrorsCommand);
	context.subscriptions.push(listTypescriptErrorsSub);

	const diagnosticCSVSub = vscode.commands.registerCommand('ri-vscode.diagnosticsCSV', diagnosticsToCSVCommand);
	//#endregion subscriptions
}

export function deactivate() {}
