const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat, ExternalHyperlink,
  TabStopType, TabStopPosition
} = require('./node_modules/docx');
const fs = require('fs');

// ─── Helpers ────────────────────────────────────────────────────────────────

const BLUE  = "1E3A5F";
const LIGHT_BLUE = "D5E8F0";
const ACCENT = "2E75B6";
const GREY  = "F5F7FA";
const WHITE = "FFFFFF";
const DARK  = "1A1A2E";

const border = (color = "CCCCCC", size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const noBorder = () => ({ style: BorderStyle.NONE, size: 0, color: "FFFFFF" });
const allBorders = (color, size) => ({ top: border(color, size), bottom: border(color, size), left: border(color, size), right: border(color, size) });
const noBorders = () => ({ top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: WHITE })],
    shading: { fill: BLUE, type: ShadingType.CLEAR },
    indent: { left: 200, right: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 4 } },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: BLUE })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 2 } },
  });
}

function h3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: DARK })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: opts.color || "333333", bold: opts.bold || false, italics: opts.italic || false })],
    indent: opts.indent ? { left: opts.indent } : undefined,
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: "333333" })],
  });
}

function tip(label, text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } },
    indent: { left: 200, right: 200 },
    children: [
      new TextRun({ text: label + " ", font: "Arial", size: 20, bold: true, color: ACCENT }),
      new TextRun({ text, font: "Arial", size: 20, color: "444444", italics: true }),
    ],
  });
}

function speakBox(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    shading: { fill: "FFF8E1", type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "F59E0B", space: 4 } },
    indent: { left: 200, right: 200 },
    children: [
      new TextRun({ text: "SAY: ", font: "Arial", size: 20, bold: true, color: "92400E" }),
      new TextRun({ text, font: "Arial", size: 20, color: "78350F", italics: true }),
    ],
  });
}

function step(num, action) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `${num}. `, font: "Arial", size: 22, bold: true, color: ACCENT }),
      new TextRun({ text: action, font: "Arial", size: 22, color: "222222" }),
    ],
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 1 } },
    children: [],
  });
}

function spacer(before = 120) {
  return new Paragraph({ spacing: { before, after: 0 }, children: [] });
}

function timingTable(rows) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1440, 2160, 5760],
    rows: [
      new TableRow({
        children: [
          headerCell("Time", 1440),
          headerCell("Section", 2160),
          headerCell("Key Actions", 5760),
        ],
      }),
      ...rows.map(([time, section, actions], i) =>
        new TableRow({
          children: [
            dataCell(time, 1440, i),
            dataCell(section, 2160, i),
            dataCell(actions, 5760, i),
          ],
        })
      ),
    ],
  });
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: BLUE, type: ShadingType.CLEAR },
    borders: allBorders(BLUE, 4),
    margins: { top: 100, bottom: 100, left: 160, right: 160 },
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20, bold: true, color: WHITE })] })],
  });
}

function dataCell(text, width, rowIdx) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: rowIdx % 2 === 0 ? WHITE : GREY, type: ShadingType.CLEAR },
    borders: allBorders("DDDDDD", 2),
    margins: { top: 80, bottom: 80, left: 160, right: 160 },
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20, color: "333333" })] })],
  });
}

function credentialTable() {
  const creds = [
    ["Treasury Manager", "treasury@banca-demo.ro", "Booking, basket proposal, collateral overview"],
    ["Collateral Manager", "collateral@banca-demo.ro", "Top-up, substitution, inventory management"],
    ["Operations Analyst", "operations@banca-demo.ro", "Settlement instructions, MT543 preview"],
    ["Risk Reviewer", "risk@banca-demo.ro", "Margin monitoring, audit trail, SFTR report"],
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2200, 2760, 4400],
    rows: [
      new TableRow({
        children: [
          headerCell("Role", 2200),
          headerCell("Email", 2760),
          headerCell("Key Capabilities", 4400),
        ],
      }),
      ...creds.map(([role, email, caps], i) =>
        new TableRow({
          children: [
            dataCell(role, 2200, i),
            dataCell(email, 2760, i),
            dataCell(caps, 4400, i),
          ],
        })
      ),
    ],
  });
}

// ─── Document ───────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 260 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 260 } } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: WHITE },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 300, after: 100 }, outlineLevel: 1 } },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Collateral Orchestrator  |  Demo Script", font: "Arial", size: 18, color: "888888" }),
                new TextRun({ text: "\tCONFIDENTIAL", font: "Arial", size: 18, color: "AAAAAA" }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 2 } },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Banca Demo Romania  \u2014  Pilot Environment", font: "Arial", size: 16, color: "AAAAAA" }),
                new TextRun({ text: "\tPage ", font: "Arial", size: 16, color: "AAAAAA" }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "AAAAAA" }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 2 } },
            }),
          ],
        }),
      },
      children: [

        // ── Cover ──────────────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: 1200, after: 120 },
          shading: { fill: BLUE, type: ShadingType.CLEAR },
          indent: { left: 0, right: 0 },
          children: [new TextRun({ text: "  Collateral Orchestrator", font: "Arial", size: 60, bold: true, color: WHITE })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 0 },
          shading: { fill: BLUE, type: ShadingType.CLEAR },
          children: [new TextRun({ text: "  Live Demo Script  \u2014  20-Minute Bank Walk-Through", font: "Arial", size: 28, color: "A8C4E0", italics: true })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 800 },
          shading: { fill: BLUE, type: ShadingType.CLEAR },
          children: [new TextRun({ text: "  Banca Demo Romania  |  Pilot Environment  |  April 2026", font: "Arial", size: 20, color: "6699BB" })],
        }),

        spacer(200),

        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({ text: "Purpose of This Document", font: "Arial", size: 24, bold: true, color: BLUE })],
        }),
        body("This script guides a presenter through a structured 20-minute demonstration of the Collateral Orchestrator platform for a bank audience. Each section includes exact steps to perform in the app and suggested talking points. Timing markers keep the session on track."),
        spacer(60),
        body("Audience: Treasury, Collateral, Risk, and Operations leads at a prospective Romanian or CEE bank."),
        body("Goal: Show that the platform solves real operational pain with a production-ready workflow \u2014 live, not slides."),

        spacer(300),

        // ── Agenda table ──────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: "Run-of-Show (20 min)", font: "Arial", size: 24, bold: true, color: BLUE })],
        }),
        timingTable([
          ["0:00", "Setup & Login", "Reset demo, log in as Treasury Manager"],
          ["1:00", "Dashboard", "Portfolio overview, KPIs, live alerts"],
          ["3:00", "Inventory", "Browse assets, status filters, asset detail sheet"],
          ["5:00", "Book a Repo", "4-step wizard, auto-proposed collateral basket"],
          ["9:00", "Margin Alert", "Simulate margin call, top-up approval"],
          ["12:00", "Substitution", "Role-switch to Collateral Manager, substitute asset"],
          ["14:00", "Operations", "MT543 settlement instruction preview"],
          ["16:00", "SFTR Report", "Regulatory output, UTI, counterparty LEI"],
          ["18:00", "Audit Trail", "Tamper-evident log, every action captured"],
          ["19:00", "Q&A Prompt", "Open questions, next-step conversation"],
        ]),

        spacer(300),

        // ── Demo accounts ─────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: "Demo Accounts", font: "Arial", size: 24, bold: true, color: BLUE })],
        }),
        body("All passwords: demo1234"),
        spacer(60),
        credentialTable(),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 1
        // ─────────────────────────────────────────────────────────────────
        divider(),
        new Paragraph({
          pageBreakBefore: true,
          spacing: { before: 0, after: 0 },
          children: [],
        }),

        h2("Section 1 \u2014 Setup & Login (0:00 \u2013 1:00)"),
        body("Goal: Start from a clean state, establish context for the audience.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Open the app in your browser. Click Reset Demo in the top-right corner and confirm. Wait for the spinner to stop."),
        step(2, "Click the Sign Out icon (if already logged in)."),
        step(3, "On the login screen, click the Treasury Manager row. Credentials fill automatically."),
        step(4, "Click Sign In."),

        spacer(80),
        speakBox("This is a live system, not a slide deck. Everything you\u2019ll see today is real \u2014 real role-based logins, real data mutations, real audit events being written as we go. Let me start as the Treasury Manager."),

        tip("TIP:", "If the backend is unreachable, a red banner appears. Start the API first: cd collateral-api && npm run dev"),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 2
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 2 \u2014 Dashboard (1:00 \u2013 3:00)"),
        body("Goal: Orient the audience to the portfolio at a glance.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Point to the KPI strip: Total Collateral Value, Total Repos, Margin Deficit count, Available Assets."),
        step(2, "Scroll to the Active Repos table. Click a repo row to navigate to Repo Detail."),
        step(3, "Point out the notification bell \u2014 click it to show pending alerts."),

        spacer(80),
        speakBox("Every morning, the treasury desk sees this \u2014 portfolio-wide coverage ratios, live margin status, and any alerts that fired overnight. No spreadsheets, no email chains. Everything is in one place."),

        tip("TIP:", "Keep the bell open briefly to show the notification list, then close it. Don\u2019t dismiss notifications yet \u2014 save that for later."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 3
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 3 \u2014 Collateral Inventory (3:00 \u2013 5:00)"),
        body("Goal: Show the asset universe, eligibility, and custody context.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Click Inventory in the left nav."),
        step(2, "Type \u201CBNR\u201D in the search bar. Point out instant filter across ISIN, name, and issuer fields."),
        step(3, "Change the Status filter to \u201CAvailable\u201D. Show only unencumbered assets."),
        step(4, "Click any row to open the asset detail sheet. Point out Adjusted Value (Market Value minus haircut), Custody Location, and Encumbrance State."),
        step(5, "Close the sheet. Clear filters."),

        spacer(80),
        speakBox("Each asset carries its haircut, eligibility rule, and custody location. When we propose a collateral basket for a repo, the system already knows which assets are eligible and what their adjusted value is. No manual cross-referencing."),

        tip("TIP:", "If asked about importing assets, click Template to download the CSV template, then point to Import CSV. Don\u2019t actually import during the demo unless pre-planned."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 4
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 4 \u2014 Book a Repo (5:00 \u2013 9:00)"),
        body("Goal: Show the end-to-end trade booking workflow with auto-proposed basket.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Click Repos in the left nav. Click New Repo."),
        step(2, "Step 1 \u2014 Trade Terms: Enter Counterparty \u201CRaiffeisen Romania\u201D, Amount \u201C5000000\u201D, Rate \u201C3.8\u201D. Click Continue."),
        step(3, "Step 2 \u2014 Basket: The system auto-proposes eligible assets. Point out the coverage ratio (must be \u2265 102%). Walk through which assets were selected and why."),
        step(4, "Step 3 \u2014 Review: Show the full trade summary \u2014 counterparty, amount, basket, buffer."),
        step(5, "Step 4 \u2014 Confirm: Click Confirm & Book. The system books the repo, locks the assets, writes to the audit trail, and fires a settlement notification."),
        step(6, "The view auto-navigates to the new Repo Detail page."),

        spacer(80),
        speakBox("From trade input to collateral basket to confirmation in under 60 seconds. The system enforces a 103% over-collateralization rule automatically. The Treasury Manager doesn\u2019t need to check a spreadsheet \u2014 the platform calculates it, shows the buffer, and locks the assets the moment the trade is confirmed."),

        tip("TIP:", "Pause on the basket step. This is often the most impressive part for treasury teams. Point out that the system chose assets by eligibility and coverage, not just by value."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 5
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 5 \u2014 Margin Alert & Top-Up (9:00 \u2013 12:00)"),
        body("Goal: Show the margin monitoring and exception handling workflow.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Click Margin & Exceptions in the left nav."),
        step(2, "Find a repo with a negative buffer (shown in red). Click it."),
        step(3, "Point out the Margin Deficit alert \u2014 the coverage has dropped below 100%."),
        step(4, "Click Top-Up Collateral. A list of available assets appears. Click Add for one of them."),
        step(5, "The repo\u2019s Posted Collateral increases, the buffer turns green, and the asset status changes to Locked."),
        step(6, "Open the notification bell \u2014 the margin deficit alert has been cleared automatically."),

        spacer(80),
        speakBox("Margin calls are the most operationally sensitive events in collateral management. Today at most banks, this means phone calls and emails. Here, the system flags the deficit, shows which assets can plug the gap, and writes the approval to the audit trail \u2014 all in one workflow."),

        tip("TIP:", "If no repo has a negative buffer after the demo reset, go to Repos, open any active repo, and explain that a margin call would trigger this same flow when market values shift."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 6
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 6 \u2014 Collateral Substitution (12:00 \u2013 14:00)"),
        body("Goal: Show role-switching and the substitution workflow.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Sign out. Sign back in as Collateral Manager (collateral@banca-demo.ro / demo1234)."),
        step(2, "Click Repos. Open an active repo."),
        step(3, "Click Substitute Collateral. A side panel opens showing the current basket and available substitutes."),
        step(4, "Click Replace next to one asset. Choose a substitute. The basket updates, collateral values recalculate, and the old asset returns to Available."),

        spacer(80),
        speakBox("Substitution happens constantly \u2014 a counterparty requests it, or you want to free up a specific bond. This workflow shows how the Collateral Manager acts on that request without needing to touch a spreadsheet or call the back office. The system recalculates coverage instantly."),

        tip("TIP:", "Mention that role separation is enforced by JWT claims \u2014 the Treasury Manager cannot perform substitution. This matters for audit and compliance teams."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 7
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 7 \u2014 Operations & MT543 (14:00 \u2013 16:00)"),
        body("Goal: Show the settlement instruction layer.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Sign out. Sign back in as Operations Analyst (operations@banca-demo.ro / demo1234)."),
        step(2, "Click Operations in the left nav."),
        step(3, "Click any repo row to open the instruction sheet."),
        step(4, "Show the MT543 instruction preview: SAFEKEEPING ACCOUNT, ISIN, Trade Date, Settlement Date, delivery leg, payment leg."),

        spacer(80),
        speakBox("The operations team generates ISO 15022 MT543 settlement instructions directly from the platform. In the current pilot, these are previewed and confirmed manually. The integration roadmap includes direct connectivity to Euroclear, Clearstream, and the BNR settlement layer."),

        tip("TIP:", "Don\u2019t get into deep SWIFT detail unless the audience is operations-focused. Mention the format, show it exists, and move on."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 8
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 8 \u2014 SFTR Report (16:00 \u2013 18:00)"),
        body("Goal: Show regulatory reporting output.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Click SFTR Report in the left nav."),
        step(2, "Walk through the KPI summary: Total Notional, Active Repos, Unique Counterparties, Total Collateral Posted."),
        step(3, "Scroll to the transactions table. Point out UTI (Unique Trade Identifier), Report Type, Counterparty LEI, Maturity Date, and Collateral ISIN."),

        spacer(80),
        speakBox("SFTR reporting is mandatory for any Romanian bank doing repo transactions. The platform generates the full trade report in real time. In the next phase, we export directly to the ARM \u2014 no manual data entry, no reconciliation spreadsheets."),

        tip("TIP:", "If asked about the ARM connection, say: \u201CThe data model is SFTR-ready. ARM connectivity is on the Q3 roadmap.\u201D"),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 9
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 9 \u2014 Audit Trail (18:00 \u2013 19:00)"),
        body("Goal: Show tamper-evident operational history.", { italic: true }),
        spacer(80),

        h3("Steps"),
        step(1, "Click Audit Trail in the left nav."),
        step(2, "Point to the log: every action from today\u2019s demo is recorded \u2014 repo created, top-up approved, collateral substituted."),
        step(3, "Show the columns: timestamp, user name, role, action, object, before-state, after-state, comment."),

        spacer(80),
        speakBox("Every action on this platform is immutable. Before and after states are captured, the user and role that performed the action are recorded, and the timestamp is exact. This is what your compliance team and internal audit will ask for during an ECB inspection."),

        // ─────────────────────────────────────────────────────────────────
        // SECTION 10
        // ─────────────────────────────────────────────────────────────────
        divider(),
        h2("Section 10 \u2014 Q&A & Close (19:00 \u2013 20:00)"),
        body("Goal: Open the conversation and advance the sale.", { italic: true }),
        spacer(80),

        h3("Suggested Closing"),
        speakBox("That\u2019s the full workflow \u2014 from booking a repo to settlement instructions to SFTR output to audit trail \u2014 in 20 minutes, on live infrastructure. The next step is a scoped pilot using your actual asset universe and counterparty list. What questions do you have?"),

        spacer(80),
        h3("Likely Questions & Answers"),
        body("Q: Can it connect to our core banking system?", { bold: true }),
        body("A: Yes. The API layer is REST-based and designed for integration. We scope the connector in the pilot phase.", { indent: 360 }),
        spacer(40),
        body("Q: What about Euroclear / Clearstream connectivity?", { bold: true }),
        body("A: The MT543 instruction format is already in the platform. Direct CSD connectivity is on the roadmap for Q3.", { indent: 360 }),
        spacer(40),
        body("Q: Is this on-premise or cloud?", { bold: true }),
        body("A: Both options are available. The pilot runs on a private VPS. We support on-premise deployment for BNR-regulated environments.", { indent: 360 }),
        spacer(40),
        body("Q: How long does a pilot take?", { bold: true }),
        body("A: 6\u20138 weeks to go live with your real data. We handle the data migration and configuration.", { indent: 360 }),
        spacer(40),
        body("Q: What does it cost?", { bold: true }),
        body("A: Pilot is a fixed-fee engagement. Production is SaaS-priced per active user per month, with a minimum commitment. We can walk through the commercial model in a follow-up.", { indent: 360 }),

        // ─────────────────────────────────────────────────────────────────
        // Appendix
        // ─────────────────────────────────────────────────────────────────
        divider(),
        new Paragraph({ pageBreakBefore: true, children: [] }),

        h2("Appendix \u2014 Before You Start"),
        spacer(60),

        h3("Pre-Demo Checklist"),
        bullet("Backend running: cd collateral-api && npm run dev (port 3001)"),
        bullet("Frontend running: cd collateral-app && npm run dev (port 5173) OR production build served"),
        bullet("Browser open to localhost:5173 or production URL"),
        bullet("Reset Demo clicked and confirmed \u2014 always start from clean data"),
        bullet("Laptop connected to HDMI / screen share ready"),
        bullet("Notifications visible in bell: at least 3\u20134 items"),
        bullet("This script printed or open on a second screen"),

        spacer(120),
        h3("Recovery Playbook"),
        body("If the API is unreachable:", { bold: true }),
        bullet("A red banner appears in the app. Click Retry."),
        bullet("Open a terminal: cd collateral-api && npm run dev"),
        bullet("Refresh the browser."),
        spacer(60),
        body("If data looks wrong:", { bold: true }),
        bullet("Click Reset Demo in the top-right corner."),
        bullet("Wait for the spinner to complete, then refresh."),
        spacer(60),
        body("If the build is not running:", { bold: true }),
        bullet("cd collateral-app && npm run dev"),
        bullet("Open http://localhost:5173 in the browser."),

        spacer(120),
        h3("Role Credentials Quick Reference"),
        body("treasury@banca-demo.ro / demo1234 \u2014 Treasury Manager"),
        body("collateral@banca-demo.ro / demo1234 \u2014 Collateral Manager"),
        body("operations@banca-demo.ro / demo1234 \u2014 Operations Analyst"),
        body("risk@banca-demo.ro / demo1234 \u2014 Risk Reviewer"),

        spacer(200),
        new Paragraph({
          spacing: { before: 0, after: 0 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Collateral Orchestrator  |  Internal Demo Use Only  |  April 2026", font: "Arial", size: 18, color: "AAAAAA", italics: true })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("/Users/vali/Desktop/1/Collateral_Demo_Script.docx", buffer);
  console.log("Done: Collateral_Demo_Script.docx");
});
