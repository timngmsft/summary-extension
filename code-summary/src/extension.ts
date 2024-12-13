import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
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
      CodeSummaryPanel.createOrShow(context.extensionUri);
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
  const config = vscode.workspace.getConfiguration('codeSummary');
  const openAIDevKey = config.get<string>('openAIDevKey');
  console.log('Open AI Developer Key:', openAIDevKey);
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
