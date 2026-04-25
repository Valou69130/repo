'use strict';

// SFTR XML Generator — ISO 20022 auth.030.001.03
// Securities Financing Transaction Regulation (EU 2015/2365)
// ESMA RTS 2019/356 + ITS 2019/363
//
// Produces schema-compliant XML for submission to EU trade repositories
// (Regis-TR, DTCC, UnaVista) via the ESMA SFTR reporting framework.

const crypto = require('crypto');

// Reporting entity — in production, sourced from institution settings
const REPORTING_ENTITY = {
  lei:          '549300BNCDEMORO00066',
  name:         'Banca Demo Romania SA',
  jurisdiction: 'RO',
  tradeRepo:    'Regis-TR',
};

// Asset type → ESMA CFI classification code (6-char)
const CFI_MAP = {
  'Government Bond': 'DBFTFR',  // Debt, Government, Fixed rate, From issuer
  'T-Bill':          'DBZXXX',  // Debt, Government, Zero coupon
  'Corporate Bond':  'DBFXXX',  // Debt, Corporate, Fixed rate
  'MMF':             'EUXXXX',  // Equity, Open-end fund
};

function cfiCode(assetType) {
  return CFI_MAP[assetType] || 'DBFXXX';
}

// UTI format: {10-char LEI prefix}{YYYYMMDD}{repoId padded to 10}
// Conforms to ESMA UTI convention (Article 4 RTS 2019/356)
function buildUTI(repoId, valueDate) {
  const datePart  = valueDate.replace(/-/g, '');
  const idPart    = String(repoId).replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(10, '0').slice(0, 10);
  return `${REPORTING_ENTITY.lei.slice(0, 10)}${datePart}${idPart}`;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt2(n) { return Number(n || 0).toFixed(2); }
function fmt4(n) { return Number(n || 0).toFixed(4); }

// Maturity type per ESMA field 23
function maturityType(startDate, maturityDate) {
  if (!maturityDate) return 'OPEN';
  const tenor = Math.ceil((new Date(maturityDate) - new Date(startDate)) / 86_400_000);
  return tenor <= 1 ? 'ONIC' : 'FIXD';
}

// Day count convention — standard for repo: Actual/360
const DAY_COUNT = 'A360';

function buildCollateralXml(assets, repoCurrency) {
  if (!assets || assets.length === 0) return '<CollPrtflCd>NOAP</CollPrtflCd>';

  const portfolioCode = assets.length > 1 ? 'BILA' : 'NOAP';

  const securities = assets.map((a) => {
    const isin        = esc(a.isin);
    const ccy         = esc(a.currency || repoCurrency);
    const mktVal      = fmt2(a.market_value);
    const haircut     = fmt2(a.haircut);
    const cfic        = cfiCode(a.type);
    const jurisdiction = isin.slice(0, 2); // ISO 3166-1 from ISIN prefix

    return `
              <Coll>
                <Scty>
                  <Id><ISIN>${isin}</ISIN></Id>
                  <ClssfctnTp>${cfic}</ClssfctnTp>
                  <Qlty>INVG</Qlty>
                  <IssrJursdctn>${jurisdiction}</IssrJursdctn>
                  <TxDt><ValDt>TODAY_PLACEHOLDER</ValDt></TxDt>
                  <MktVal><Amt Ccy="${ccy}">${mktVal}</Amt></MktVal>
                  <HrcutOrMrgn><HrcutOrMrgn>${haircut}</HrcutOrMrgn></HrcutOrMrgn>
                  <CollDlvrByVal>true</CollDlvrByVal>
                </Scty>
              </Coll>`;
  }).join('');

  return `<CollPrtflCd>${portfolioCode}</CollPrtflCd>${securities}`;
}

/**
 * generateSFTRXml — produce an ESMA-schema-aligned SFTR trade report.
 *
 * @param {object} repo     — repo row from DB
 * @param {object[]} assets — asset rows linked to this repo
 * @param {string} [actionType] — NEWT | MODI | ETRM | REMO (default NEWT)
 * @returns {string} XML string
 */
function generateSFTRXml({ repo, assets = [], actionType = 'NEWT' }) {
  const now             = new Date();
  const submissionDtTm  = now.toISOString().replace(/\.\d{3}Z$/, '');
  const reportDate      = now.toISOString().slice(0, 10);
  const techRecordId    = crypto.randomUUID();

  const uti             = buildUTI(repo.id, repo.start_date);
  const otherCptyLei    = esc(repo.counterparty_lei || `NOCPTYRO${String(repo.counterparty).slice(0, 6).toUpperCase().replace(/\s/g, '0')}00`);
  const currency        = esc(repo.currency || 'RON');
  const principal       = fmt2(repo.amount);
  const rate            = fmt4(repo.rate);
  const matType         = maturityType(repo.start_date, repo.maturity_date);
  const execDtTm        = `${esc(repo.start_date)}T09:00:00`;

  const collateralXml   = buildCollateralXml(assets, repo.currency)
    .replace(/TODAY_PLACEHOLDER/g, esc(repo.start_date));

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  SFTR Transaction Report — ${actionType}
  Schema:     ISO 20022 auth.030.001.03
  Regulation: EU 2015/2365 (SFTR) | ESMA RTS 2019/356 | ITS 2019/363
  Reporting Entity: ${REPORTING_ENTITY.name} (${REPORTING_ENTITY.lei})
  Trade Repository: ${REPORTING_ENTITY.tradeRepo}
  Generated:  ${submissionDtTm}Z by CollateralOS
-->
<Document
  xmlns="urn:iso:std:iso:20022:tech:xsd:auth.030.001.03"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:auth.030.001.03 auth.030.001.03.xsd">

  <FinInstrmRptgSFTRRpt>

    <RptHdr>
      <RptgNtty>
        <OrgnlRptgNtty>
          <LEI>${REPORTING_ENTITY.lei}</LEI>
        </OrgnlRptgNtty>
      </RptgNtty>
      <RptSbmssnDtTm>${submissionDtTm}</RptSbmssnDtTm>
    </RptHdr>

    <TradData>
      <Rpt>
        <TechRcrd>

          <TechAttr>
            <TechRcrdId>${techRecordId}</TechRcrdId>
            <RptSts>${actionType}</RptSts>
          </TechAttr>

          <!-- ── Table 1: Counterparty Data ───────────────────────────────── -->
          <CtrPtyData>
            <RptgCtrPty>
              <LEI>${REPORTING_ENTITY.lei}</LEI>
              <Sctr>F</Sctr>
              <NttyRspnsblForRpt>
                <LEI>${REPORTING_ENTITY.lei}</LEI>
              </NttyRspnsblForRpt>
            </RptgCtrPty>
            <OthrCtrPty>
              <Ntty><LEI>${otherCptyLei}</LEI></Ntty>
              <Sctr>F</Sctr>
            </OthrCtrPty>
          </CtrPtyData>

          <!-- ── Table 2: Loan / Transaction Data ────────────────────────── -->
          <LnData>
            <UnqTradIdr>${esc(uti)}</UnqTradIdr>
            <EvtDt>${reportDate}</EvtDt>
            <ExctnDtTm>${execDtTm}</ExctnDtTm>
            <ValDt>${esc(repo.start_date)}</ValDt>
            <MtrtyDt>${esc(repo.maturity_date)}</MtrtyDt>
            <MtrtyDtTp>${matType}</MtrtyDtTp>
            <GnlColl>SPEC</GnlColl>
            <DBIRateOrMrgn>${rate}</DBIRateOrMrgn>
            <RateTp>FIXE</RateTp>
            <DayCntCnvtn>${DAY_COUNT}</DayCntCnvtn>
            <SttlmTp>DVCP</SttlmTp>
            <PrncplAmtVal>
              <Amt Ccy="${currency}">${principal}</Amt>
            </PrncplAmtVal>
          </LnData>

          <!-- ── Trading Venue ─────────────────────────────────────────────── -->
          <TradgVnData>
            <TradgVn>XOFF</TradgVn>
          </TradgVnData>

          <!-- ── Table 3: Collateral Data ─────────────────────────────────── -->
          <CollData>
            ${collateralXml}
          </CollData>

        </TechRcrd>
      </Rpt>
    </TradData>

  </FinInstrmRptgSFTRRpt>
</Document>`;
}

module.exports = { generateSFTRXml, REPORTING_ENTITY, buildUTI };
