import * as vscode from 'vscode';
import { expandCommand, helloCommand, importCommand, tsCommand } from './commands';


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
	//#endregion subscriptions
}

export function deactivate() {}
