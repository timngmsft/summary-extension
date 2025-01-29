import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import CodeSummary from './codeSummary';

export function activate(context: vscode.ExtensionContext) {
  function loadConfig() {
    const configPath = path.join(__dirname, '..', 'config.json');
    const configFile = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configFile);
  }
  let configFile = loadConfig();

  // Register the command to open the Code Summary
  context.subscriptions.push(
     vscode.commands.registerCommand('extension.openCodeSummary', async () => {
      let codeSummary = new CodeSummary(context, configFile);
      await codeSummary.initCodeSummaryPreview();
     })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
