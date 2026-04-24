'use strict';

const PDFDocument = require('pdfkit');

/**
 * Stream a margin call notice PDF into the given Node.js writable stream (e.g. express res).
 * Uses only built-in Helvetica/Times fonts — no external font files needed in serverless.
 */
function generateMarginCallPdf(call, res) {
  const doc = new PDFDocument({ margin: 60, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="margin-call-${call.id}.pdf"`,
  );

  doc.pipe(res);

  const fmt = (n) =>
    n != null ? Number(n).toLocaleString('en-US') : '—';

  const today = new Date().toISOString().slice(0, 10);

  // ── Header ────────────────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('CollateralOS', { align: 'left' })
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#64748b')
    .text('Collateral & Repo Management Platform', { align: 'left' })
    .fillColor('#000000')
    .moveDown(0.5);

  doc
    .moveTo(60, doc.y)
    .lineTo(doc.page.width - 60, doc.y)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke()
    .moveDown(0.5);

  // ── Title & reference ─────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#0f172a')
    .text('MARGIN CALL NOTICE', { align: 'center' })
    .moveDown(0.3);

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#475569')
    .text(`Reference: ${call.id}`, { align: 'center' })
    .text(`Date: ${today}`, { align: 'center' })
    .fillColor('#000000')
    .moveDown(1);

  // ── Agreement details ─────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Agreement Details')
    .moveDown(0.3);

  const fields = [
    ['Agreement ID',   call.agreementId || call.agreement_id || '—'],
    ['Direction',      call.direction || '—'],
    ['Call Date',      call.callDate   || call.call_date || today],
    ['Deadline',       (call.deadlineAt || call.deadline_at || '—').replace('T', ' ').replace('Z', ' UTC')],
    ['Currency',       call.currency || '—'],
  ];

  fields.forEach(([label, value]) => {
    doc
      .font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true, width: 160 })
      .font('Helvetica').text(` ${value}`);
  });

  doc.moveDown(0.8);

  // ── Amounts ───────────────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Margin Call Amounts')
    .moveDown(0.3);

  const amounts = [
    ['Exposure Amount',   `${fmt(call.exposureAmount  ?? call.exposure_amount)}  ${call.currency || ''}`],
    ['Collateral Value',  `${fmt(call.collateralValue ?? call.collateral_value)} ${call.currency || ''}`],
    ['Call Amount',       `${fmt(call.callAmount      ?? call.call_amount)}      ${call.currency || ''}`],
  ];

  amounts.forEach(([label, value], i) => {
    const bold = i === 2; // highlight call amount
    doc
      .font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true, width: 160 })
      .font(bold ? 'Helvetica-Bold' : 'Helvetica').text(` ${value}`);
  });

  doc.moveDown(0.8);

  // ── Four-eyes notice ──────────────────────────────────────────────────────
  if (call.fourEyesRequired || call.four_eyes_required) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#4f46e5')
      .text('⚠  Four-eyes approval required before acceptance of this notice.')
      .fillColor('#000000')
      .moveDown(0.5);
  }

  // ── Settlement instructions ───────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Settlement Instructions')
    .moveDown(0.3)
    .font('Helvetica')
    .fontSize(10)
    .text(
      'Please deliver eligible collateral in accordance with the governing GMRA/ISDA CSA ' +
      'to the account specified in your agreement schedule. Settlement must be completed ' +
      'before the deadline indicated above via SaFIR / BNR Central Registry.',
    )
    .moveDown(1);

  // ── Footer ────────────────────────────────────────────────────────────────
  doc
    .moveTo(60, doc.y)
    .lineTo(doc.page.width - 60, doc.y)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke()
    .moveDown(0.5);

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#94a3b8')
    .text(
      'This notice is generated automatically by CollateralOS. ' +
      'It does not constitute legal advice. ' +
      `Generated: ${new Date().toISOString()}`,
      { align: 'center' },
    );

  doc
    .moveDown(1)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#0f172a')
    .text('Authorised by: _______________________________', { align: 'left' })
    .moveDown(0.3)
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748b')
    .text('Signature / Date', { align: 'left' });

  doc.end();
}

module.exports = { generateMarginCallPdf };
