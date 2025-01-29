import * as vscode from 'vscode';
import * as path from 'path';
import { AzureOpenAI } from 'openai';

export default class CodeSummary {

    private panel!: vscode.WebviewPanel;
    private context: vscode.ExtensionContext;
    private configFile: any;
    private readonly disposables: vscode.Disposable[] = [];
    private _disposed: boolean = false;
    private readonly _onDisposeEmitter = new vscode.EventEmitter<void>();
    public readonly onDispose = this._onDisposeEmitter.event;
    private readonly _onDidChangeViewStateEmitter = new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>();

    //returns true if an html document is open
    constructor(context: vscode.ExtensionContext, configFile: any) {
        this.context = context;
        this.configFile = configFile;
    };

    private readyToShowAI() {
        return vscode.window.activeTextEditor
            && this.showAISummaryForDocumentType()
            && this.panel
            && this.panel !== undefined;
    }

    private buildPrompt(document: string) {
        let basePrompt = "Summarize the following code snippet:\n";
        return basePrompt + document;
    }

    private async summarizeDocument(document: string) {
        let config = vscode.workspace.getConfiguration('codeSummary');
        let apiKey = config.get<string>('openAIDevKey');
        let endpoint = this.configFile.azureOpenAIEndpoint;
        let apiVersion = '2024-10-21';
        let prompt = this.buildPrompt(document);
        console.log('Open AI Developer Key:', apiKey);
        console.log('Endpoint:', endpoint);
        try {
            const options = { endpoint, apiKey, apiVersion }
            const client = new AzureOpenAI(options);
            const result = await client.chat.completions.create({
            messages: [
                { role: "user", content: prompt } ],
            model: '',
            max_tokens: 100
            });

            return result.choices[0].message.content ?? 'No summary available';
        } catch (error) {
            console.error('Error fetching summary:', error);
            return 'Error fetching summary';
        }
    }

    async handleTextDocumentChange() {
        if (this.readyToShowAI()) {
            let sourceCode = vscode.window.activeTextEditor!.document.getText();
            const filePaths = vscode.window.activeTextEditor!.document.fileName.split('/');
            const fileName = filePaths[filePaths.length - 1]
            this.panel.title = `Code summary for ${fileName}`;
            let codeSummary = await this.summarizeDocument(sourceCode);
            console.log('Code summary:', codeSummary);
            this.panel.webview.html = this.getWebviewContent(this.panel.webview, codeSummary, fileName);
        }
    }

    private getWebviewContent(webview: vscode.Webview, html: string, fileName: string) {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'));
        return `<!doctype html>
                <html lang="en">
                <head>
                    <link href="${styleUri}" rel="stylesheet">
                </head>
                <body>
                    <div id="content">
                    ${html}     
                    </div>
                </body>
            </html>`
    }

    private getDocumentType(): string {
        let languageId = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.languageId.toLowerCase() : '';
        return languageId;
    }

    private showAISummaryForDocumentType(): boolean {
        let result = this.getDocumentType() === "markdown";
        if (!result) {
            vscode.window.showInformationMessage("No file");
        }
        return true;
    }

    async initCodeSummaryPreview() {
        let proceed = this.showAISummaryForDocumentType();
        if (proceed && vscode.window.activeTextEditor) {
            const filePaths = vscode.window.activeTextEditor.document.fileName.split('/');
            const fileName = filePaths[filePaths.length - 1];
            // Create and show a new webview
            this.panel = vscode.window.createWebviewPanel(
                'codeSummary',
                '[Code Summary] ' + fileName,
                vscode.ViewColumn.Two,
                {
                    // Enable scripts in the webview
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    // And restrict the webview to only loading content from our extension's `assets` directory.
                    localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'assets')), vscode.Uri.file(path.join(vscode.workspace.rootPath!, 'content/media'))]
                }
            );
            this._disposed = false;

            await this.handleTextDocumentChange.call(this);

            vscode.workspace.onDidChangeTextDocument(await this.handleTextDocumentChange.bind(this));
            vscode.workspace.onDidChangeConfiguration(await this.handleTextDocumentChange.bind(this));
            vscode.workspace.onDidSaveTextDocument(await this.handleTextDocumentChange.bind(this));
            vscode.window.onDidChangeActiveTextEditor(await this.handleTextDocumentChange.bind(this));

            this.panel.onDidDispose(() => {
                this.dispose();
            }, null, this.disposables);
        }
    }

    public dispose() {
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this._onDisposeEmitter.fire();

        this._onDisposeEmitter.dispose();
        this.panel.dispose();

        while (this.disposables.length) {
            const item = this.disposables.pop();
            if (item) {
                item.dispose();
            }
        }
    }
}