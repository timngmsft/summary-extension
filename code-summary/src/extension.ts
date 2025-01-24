import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AzureOpenAI } from 'openai';

let config: any;

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  const configFile = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configFile);
}

export function activate(context: vscode.ExtensionContext) {
  loadConfig();

  // Create a status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'extension.openCodeSummary';
  statusBarItem.text = '$(preview) Open Code Summary';
  statusBarItem.tooltip = 'Open Code Summary';
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);

  // Register the command to open the Code Summary
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.openCodeSummary', () => {
      const panel = vscode.window.createWebviewPanel(
        'codeSummary',
        'Code Summary',
        vscode.ViewColumn.One,
        {
          enableScripts: true
        }
      );

      panel.webview.html = getWebviewContent();

      panel.webview.onDidReceiveMessage(
        async message => {
          switch (message.command) {
            case 'fetchSummary':
              const summary = await fetchSummaryFromAzureOpenAI(message.text);
              panel.webview.postMessage({ command: 'update', content: summary });
              return;
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );

  // Show the status bar item when any file is opened
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      statusBarItem.show();
      if (CodeSummaryPanel.currentPanel) {
        CodeSummaryPanel.currentPanel.update(editor.document.getText());
      }
    } else {
      statusBarItem.hide();
    }
  });

  // Update the Code Summary when the text document changes
  vscode.workspace.onDidChangeTextDocument(event => {
    if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
      if (CodeSummaryPanel.currentPanel) {
        CodeSummaryPanel.currentPanel.update(event.document.getText());
      }
    }
  });

  // Ensure the status bar item is visible initially
  if (vscode.window.activeTextEditor) {
    statusBarItem.show();
  }

  // Access the Open AI Developer Key setting
  let config = vscode.workspace.getConfiguration('codeSummary');
  let openAIDevKey = config.get<string>('openAIDevKey');
  console.log('Open AI Developer Key:', openAIDevKey);

  // Listen for configuration changes
  vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('codeSummary.openAIDevKey')) {
      config = vscode.workspace.getConfiguration('codeSummary');
      openAIDevKey = config.get<string>('openAIDevKey');
      console.log('Updated OpenAI Developer Key:', openAIDevKey);
    }
  });
}

async function fetchSummaryFromAzureOpenAI(messages: string): Promise<string> {
  const apiKey = vscode.workspace.getConfiguration('codeSummary').get<string>('openAIDevKey') ?? "";
  const endpoint = config.azureOpenAIEndpoint;
  const apiVersion = '2024-10-21';

  console.log('API Key:', apiKey);
  console.log('Endpoint:', endpoint);

  try {
    const options = { endpoint, apiKey, apiVersion }
    const client = new AzureOpenAI(options);
    const result = await client.chat.completions.create({
      messages: [
        { role: "user", content: messages } ],
      model: '',
      max_tokens: 100
    });

    return result.choices[0].message.content ?? 'No summary available';
  } catch (error) {
    console.error('Error fetching summary:', error);
    return 'Error fetching summary';
  }
}

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Summary</title>
</head>
<body>
  <h1>Code Summary</h1>
  <div id="content"></div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'update':
          document.getElementById('content').innerText = message.content;
          break;
      }
    });

    function fetchSummary() {
      const text = 'Your text to summarize';
      vscode.postMessage({ command: 'fetchSummary', text: text });
    }

    fetchSummary();
  </script>
</body>
</html>`;
}

class CodeSummaryPanel {
  public static currentPanel: CodeSummaryPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : undefined;

    if (CodeSummaryPanel.currentPanel) {
      CodeSummaryPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeSummary',
      'Code Summary',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    CodeSummaryPanel.currentPanel = new CodeSummaryPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, []);

    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      []
    );
  }

  public dispose() {
    CodeSummaryPanel.currentPanel = undefined;
    this._panel.dispose();
  }

  public update(content: string) {
    this._panel.webview.postMessage({ type: 'update', content });
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'Code Summary';
    this._panel.webview.html = this._getHtmlForWebview(webview);

    if (vscode.window.activeTextEditor) {
      this.update(vscode.window.activeTextEditor.document.getText());
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Code Summary</title>
</head>
<body>
  <h1>Code Summary</h1>
  <div id="content"></div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'update':
          document.getElementById('content').innerText = message.content;
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
