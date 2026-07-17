# CA Invoice Utility

This workspace contains a local-first invoice tool built from three pieces:

- `server.js`: Express backend, Excel database initialization, invoice PDF generation, and file/export endpoints.
- `app/`: Static frontend for onboarding, client management, invoice creation, and batch export actions.
- `main.js`: Electron wrapper that starts the local server and loads the frontend in a desktop window.

## How the tool works

1. On startup, the backend loads the company registry at `~/Desktop/Invoices Utility/companies.json` and resolves the active company. A legacy single-company layout is migrated automatically into `Companies/<company-id>/` on first run.
2. Each company has fully isolated data under `~/Desktop/Invoices Utility/Companies/<company-id>/`: its own `Invoice_Database.xlsx`, `Invoices raised/` PDFs, and `Whatsapp integration/` exports. The Companies button in the dashboard switches or creates companies.
3. The frontend loads the active company's profile, clients, and invoices from the backend.
4. New invoices are saved into the company's Excel workbook and rendered to PDF with Puppeteer.
5. GST and Non-GST invoices use independent numbering series (`GST/YY-MM/NNN` and `INV/YY-MM/NNN`), with separate dashboard tabs for each type. Bulk generation requires all selected tasks to share the same GST setting.
6. PDFs are written to `Companies/<company-id>/Invoices raised/<Month Year>/`.
7. Batch actions generate Excel files for WhatsApp sends and reminder workflows in the active company's folder.

## Folder guide

- `app/index.html`: main UI markup
- `app/script.js`: frontend state, fetching, invoice generation flow
- `app/style.css`: UI and PDF styling
- `app/lib/qrious.min.js`: QR code generation for UPI payments
- `license-manager.js`: machine-bound license activation and verification
- `package.json`: runtime scripts and dependencies

## Cleanup performed

- Removed generated packaging output and stale build logs from the workspace.
- Removed an unused browser PDF library; PDF creation is handled by Puppeteer on the server.
- Removed unused packaging config and dependencies that belonged to an abandoned `electron-builder` path.

## Run locally

- `npm start`: run the Express app in a browser
- `npm run dev`: launch the Electron desktop shell
- `npm run build`: package the Electron app into `dist/`
