const bcrypt = require('bcryptjs');
const { appendEvent } = require('./appendEvent');

const USERS = [
  { name: 'Treasury Manager',   email: 'treasury@banca-demo.ro',   password: 'demo1234', role: 'Treasury Manager' },
  { name: 'Collateral Manager', email: 'collateral@banca-demo.ro', password: 'demo1234', role: 'Collateral Manager' },
  { name: 'Operations Analyst', email: 'operations@banca-demo.ro', password: 'demo1234', role: 'Operations Analyst' },
  { name: 'Risk Reviewer',      email: 'risk@banca-demo.ro',       password: 'demo1234', role: 'Risk Reviewer' },
  { name: 'Credit Approver',    email: 'approver@banca-demo.ro',   password: 'demo1234', role: 'Credit Approver' },
];

const ASSETS = [
  { id:'AST-001', isin:'RO1827DBN011', name:'Romania Gov Bond 2028', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:12000000, market_value:12180000, haircut:3, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1827DBN011-SAFIR-001' }) },
  { id:'AST-002', isin:'RO1BVB2029A1', name:'Romania Gov Bond 2029', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:9000000, market_value:9190000, haircut:4, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1BVB2029A1-SAFIR-002' }) },
  { id:'AST-003', isin:'ROTBILL2026X', name:'Romania T-Bill 2026', issuer:'Romanian Government', type:'T-Bill', currency:'RON', quantity:4500000, market_value:4470000, haircut:2, eligibility:'Eligible for central bank use', custody:'SaFIR / BNR', status:'Reserved', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'pending_confirmation', reconState:'pending', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T08:00:00', externalRef:'ROTBILL2026X-SAFIR-003' }) },
  { id:'AST-004', isin:'LU0290358497', name:'EUR Liquidity Fund A', issuer:'Amundi Money Market Fund', type:'MMF', currency:'EUR', quantity:2100000, market_value:2100000, haircut:6, eligibility:'Counterparty restricted', custody:'Euroclear Bank SA/NV', status:'Available', integration_json: JSON.stringify({ sourceSystem:'Euroclear SWIFT feed', sourceLedger:'Euroclear Bank holding account', settlementState:'confirmed', reconState:'pending', custodyLocation:'Euroclear Bank SA/NV', lastSyncTs:'2026-04-06T08:30:00', externalRef:'ECL-LU0290358497-20260406' }) },
  { id:'AST-005', isin:'RO1832DBN0A3', name:'Romania Gov Bond 2032', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:7000000, market_value:7350000, haircut:5, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Locked', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'unmatched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T07:45:00', externalRef:'RO1832DBN0A3-SAFIR-005' }) },
  { id:'AST-006', isin:'RO1835DBN0B4', name:'Romania Gov Bond 2035', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:5400000, market_value:5600000, haircut:6, eligibility:'Internal restriction', custody:'SaFIR / BNR', status:'Pledged', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1835DBN0B4-SAFIR-006' }) },
  { id:'AST-007', isin:'RO1830DBN022', name:'Romania Gov Bond 2030', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:8500000, market_value:8720000, haircut:4, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1830DBN022-SAFIR-007' }) },
  { id:'AST-008', isin:'RO1827DBN033', name:'Romania Gov Bond 2027', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:11000000, market_value:11150000, haircut:3, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1827DBN033-SAFIR-008' }) },
  { id:'AST-009', isin:'RO1833DBN0C5', name:'Romania Gov Bond 2033', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:6200000, market_value:6480000, haircut:5, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1833DBN0C5-SAFIR-009' }) },
  { id:'AST-010', isin:'ROTBILL26S02', name:'Romania T-Bill Apr 2026', issuer:'Romanian Government', type:'T-Bill', currency:'RON', quantity:3800000, market_value:3775000, haircut:2, eligibility:'Eligible for central bank use', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'ROTBILL26S02-SAFIR-010' }) },
  { id:'AST-011', isin:'FR0013508470', name:'OAT 0.75% 2028', issuer:'Republic of France', type:'Government Bond', currency:'EUR', quantity:4000000, market_value:3910000, haircut:2, eligibility:'Eligible for overnight repo', custody:'Euroclear Bank SA/NV', status:'Available', integration_json: JSON.stringify({ sourceSystem:'Euroclear SWIFT feed', sourceLedger:'Euroclear Bank holding account', settlementState:'confirmed', reconState:'matched', custodyLocation:'Euroclear Bank SA/NV', lastSyncTs:'2026-04-06T08:45:00', externalRef:'ECL-FR0013508470-20260406' }) },
  { id:'AST-012', isin:'DE0001102580', name:'Bund 1.70% 2032', issuer:'Federal Republic of Germany', type:'Government Bond', currency:'EUR', quantity:3500000, market_value:3440000, haircut:1, eligibility:'Eligible for overnight repo', custody:'Euroclear Bank SA/NV', status:'Available', integration_json: JSON.stringify({ sourceSystem:'Euroclear SWIFT feed', sourceLedger:'Euroclear Bank holding account', settlementState:'confirmed', reconState:'matched', custodyLocation:'Euroclear Bank SA/NV', lastSyncTs:'2026-04-06T08:45:00', externalRef:'ECL-DE0001102580-20260406' }) },
  { id:'AST-013', isin:'RO1840DBN0D6', name:'Romania Gov Bond 2040', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:4500000, market_value:4820000, haircut:7, eligibility:'Internal restriction', custody:'SaFIR / BNR', status:'Reserved', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'pending_confirmation', reconState:'pending', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T08:00:00', externalRef:'RO1840DBN0D6-SAFIR-013' }) },
  { id:'AST-014', isin:'RO1836DBN0E7', name:'Romania Gov Bond 2036', issuer:'Romanian Government', type:'Government Bond', currency:'RON', quantity:9800000, market_value:10150000, haircut:6, eligibility:'Eligible for overnight repo', custody:'SaFIR / BNR', status:'Pledged', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'RO1836DBN0E7-SAFIR-014' }) },
  { id:'AST-015', isin:'ROTBILL26L03', name:'Romania T-Bill Jun 2026', issuer:'Romanian Government', type:'T-Bill', currency:'RON', quantity:5200000, market_value:5130000, haircut:2, eligibility:'Eligible for central bank use', custody:'SaFIR / BNR', status:'Available', integration_json: JSON.stringify({ sourceSystem:'SaFIR position feed', sourceLedger:'SaFIR custody register', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'ROTBILL26L03-SAFIR-015' }) },
];

const REPOS = [
  { id:'R-1021', counterparty:'UniBank Bucharest', amount:10000000, currency:'RON', rate:5.15, start_date:'2026-04-01', maturity_date:'2026-04-02', state:'Active', required_collateral:10300000, posted_collateral:10540000, buffer:400000, settlement:'Confirmed', notes:'Standard overnight repo backed by Romanian government bonds.', assets:['AST-001'], integration_json: JSON.stringify({ sourceSystem:'Bloomberg Tradebook', sourceLedger:'Bloomberg OTC Fixed Income', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T09:00:00', externalRef:'BBG-TKT-20260401-1021', safirRef:'SAFIR/2026/04/01/R1021' }) },
  { id:'R-1024', counterparty:'Danube Capital', amount:8000000, currency:'RON', rate:5.3, start_date:'2026-04-01', maturity_date:'2026-04-03', state:'Margin deficit', required_collateral:8400000, posted_collateral:8010000, buffer:-390000, settlement:'Confirmed', notes:'Top-up required due to collateral value movement.', assets:['AST-005'], integration_json: JSON.stringify({ sourceSystem:'Murex import', sourceLedger:'Murex OTC Derivatives Book', settlementState:'confirmed', reconState:'unmatched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T06:50:00', externalRef:'MRX-2026-04-1024', safirRef:'SAFIR/2026/04/01/R1024' }) },
  { id:'R-1018', counterparty:'Carpathia Bank', amount:6000000, currency:'RON', rate:5.05, start_date:'2026-03-31', maturity_date:'2026-04-01', state:'Maturing', required_collateral:6200000, posted_collateral:6320000, buffer:120000, settlement:'Awaiting confirmation', notes:'Unwind prep in progress.', assets:['AST-003'], integration_json: JSON.stringify({ sourceSystem:'Manual Entry', sourceLedger:'Internal Treasury Book', settlementState:'pending_confirmation', reconState:'pending', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-06T08:00:00', externalRef:'INT-TRY-20260331-1018', safirRef:'SAFIR/2026/03/31/R1018' }) },
  { id:'R-1011', counterparty:'Balkan Treasury House', amount:5000000, currency:'EUR', rate:3.25, start_date:'2026-03-28', maturity_date:'2026-03-29', state:'Closed', required_collateral:5200000, posted_collateral:5230000, buffer:30000, settlement:'Confirmed', notes:'Historical completed trade retained for audit.', assets:['AST-004'], integration_json: JSON.stringify({ sourceSystem:'Bloomberg Tradebook', sourceLedger:'Bloomberg OTC Fixed Income', settlementState:'confirmed', reconState:'matched', custodyLocation:'Euroclear Bank SA/NV', lastSyncTs:'2026-04-06T09:00:00', externalRef:'BBG-TKT-20260328-1011', safirRef:'SAFIR/2026/03/28/R1011' }) },
  { id:'R-1025', counterparty:'BNR Open Market', amount:15000000, currency:'RON', rate:5.0, start_date:'2026-04-07', maturity_date:'2026-04-14', state:'Active', required_collateral:15450000, posted_collateral:15720000, buffer:270000, settlement:'Confirmed', notes:'Weekly BNR open market operation. T-bills and govies as collateral.', assets:['AST-007','AST-010'], integration_json: JSON.stringify({ sourceSystem:'BNR ROMIT direct', sourceLedger:'BNR Monetary Operations Book', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-07T09:30:00', externalRef:'BNR-OMO-20260407-1025', safirRef:'SAFIR/2026/04/07/R1025' }) },
  { id:'R-1026', counterparty:'UniBank Bucharest', amount:12000000, currency:'RON', rate:5.2, start_date:'2026-04-05', maturity_date:'2026-04-12', state:'Active', required_collateral:12360000, posted_collateral:12540000, buffer:180000, settlement:'Confirmed', notes:'7-day term repo. Single bond line, well-covered.', assets:['AST-008'], integration_json: JSON.stringify({ sourceSystem:'Bloomberg Tradebook', sourceLedger:'Bloomberg OTC Fixed Income', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-04-05T10:00:00', externalRef:'BBG-TKT-20260405-1026', safirRef:'SAFIR/2026/04/05/R1026' }) },
  { id:'R-1027', counterparty:'Danube Capital', amount:4000000, currency:'EUR', rate:3.15, start_date:'2026-04-08', maturity_date:'2026-04-10', state:'Active', required_collateral:4120000, posted_collateral:4200000, buffer:80000, settlement:'Confirmed', notes:'EUR 2-day repo with European govies basket.', assets:['AST-011','AST-012'], integration_json: JSON.stringify({ sourceSystem:'Bloomberg Tradebook', sourceLedger:'Bloomberg OTC Fixed Income', settlementState:'confirmed', reconState:'matched', custodyLocation:'Euroclear Bank SA/NV', lastSyncTs:'2026-04-08T08:15:00', externalRef:'BBG-TKT-20260408-1027', safirRef:'SAFIR/2026/04/08/R1027' }) },
  { id:'R-1008', counterparty:'Carpathia Bank', amount:7500000, currency:'RON', rate:4.95, start_date:'2026-03-24', maturity_date:'2026-03-25', state:'Closed', required_collateral:7725000, posted_collateral:7800000, buffer:75000, settlement:'Confirmed', notes:'Historical overnight trade. Collateral released on maturity.', assets:[], integration_json: JSON.stringify({ sourceSystem:'Murex import', sourceLedger:'Murex OTC Derivatives Book', settlementState:'confirmed', reconState:'matched', custodyLocation:'SaFIR / BNR Central Registry', lastSyncTs:'2026-03-25T10:00:00', externalRef:'MRX-2026-03-1008', safirRef:'SAFIR/2026/03/24/R1008' }) },
];

const NOTIFICATIONS = [
  { severity:'Critical', text:'Margin deficit on Repo R-1024', target:'R-1024' },
  { severity:'Warning', text:'Repo R-1018 matures today', target:'R-1018' },
  { severity:'Warning', text:'Settlement confirmation pending for R-1018', target:'R-1018' },
  { severity:'Info', text:'Collateral release completed for R-1011', target:'R-1011' },
];

const AGREEMENTS = [
  {
    id: 'AGR-UNI-001',
    counterparty: 'UniBank Bucharest',
    agreement_type: 'GMRA',
    governing_law: 'English Law',
    base_currency: 'RON',
    threshold: 0,
    minimum_transfer_amount: 100000,
    rounding: 10000,
    call_notice_deadline_time: '11:00',
    four_eyes_threshold: 5000000,
    status: 'active',
    effective_date: '2025-01-15',
  },
  {
    id: 'AGR-DAN-001',
    counterparty: 'Danube Capital',
    agreement_type: 'GMRA',
    governing_law: 'English Law',
    base_currency: 'EUR',
    threshold: 0,
    minimum_transfer_amount: 50000,
    rounding: 5000,
    call_notice_deadline_time: '11:00',
    four_eyes_threshold: 1000000,
    status: 'active',
    effective_date: '2024-09-01',
  },
  {
    id: 'AGR-CAR-001',
    counterparty: 'Carpathia Bank',
    agreement_type: 'GMRA',
    governing_law: 'Romanian Law',
    base_currency: 'RON',
    threshold: 100000,
    minimum_transfer_amount: 50000,
    rounding: 10000,
    call_notice_deadline_time: '11:00',
    four_eyes_threshold: 10000000,
    status: 'active',
    effective_date: '2023-06-15',
  },
];

// Seeded margin calls — `events` is the ordered sequence applied via appendEvent.
// Each event is { type, actor: 'cm'|'tm'|'approver'|'system', payload }.
// Keep amounts consistent with the parent agreement's four_eyes_threshold.
const MARGIN_CALLS = [
  {
    id: 'MC-DEMO-001', agreement_id: 'AGR-UNI-001', direction: 'issued',
    call_date: '2026-04-10', exposure_amount: 10300000, collateral_value: 9800000,
    call_amount: 500000, currency: 'RON', issued_at: '2026-04-10T08:15:00Z',
    deadline_at: '2026-04-10T11:00:00Z', issued_by: 'cm', four_eyes_required: 0,
    events: [
      { type: 'issued',          actor: 'cm', payload: { callAmount: 500000, currency: 'RON' } },
      { type: 'accepted',        actor: 'cm', payload: { callAmount: 500000 } },
      { type: 'delivery_marked', actor: 'cm', payload: { settlementRef: 'SWIFT-20260410-001', deliveredAmount: 500000, varianceReason: null } },
      { type: 'settled',         actor: 'cm', payload: {} },
      { type: 'resolved',        actor: 'system', payload: { auto: true } },
    ],
  },
  {
    id: 'MC-DEMO-002', agreement_id: 'AGR-DAN-001', direction: 'received',
    call_date: '2026-04-14', exposure_amount: 4200000, collateral_value: 3800000,
    call_amount: 400000, currency: 'EUR', issued_at: '2026-04-14T09:05:00Z',
    deadline_at: '2026-04-14T11:00:00Z', issued_by: 'cm', four_eyes_required: 0,
    events: [
      { type: 'issued',         actor: 'cm', payload: { callAmount: 400000, currency: 'EUR', direction: 'received' } },
      { type: 'dispute_opened', actor: 'cm', payload: { reasonCode: 'valuation', theirProposedValue: 400000, ourProposedValue: 310000 } },
    ],
    dispute: {
      id: 'DSP-MC-DEMO-002-01', reason_code: 'valuation',
      their_proposed_value: 400000, our_proposed_value: 310000, delta: 90000,
      opened_by: 'cm', opened_at: '2026-04-14T09:08:00Z', status: 'open',
    },
  },
  {
    id: 'MC-DEMO-003', agreement_id: 'AGR-UNI-001', direction: 'received',
    call_date: '2026-04-15', exposure_amount: 62500000, collateral_value: 56000000,
    call_amount: 6500000, currency: 'RON', issued_at: '2026-04-15T08:45:00Z',
    deadline_at: '2026-04-15T11:00:00Z', issued_by: 'cm', four_eyes_required: 1,
    events: [
      { type: 'issued',              actor: 'cm', payload: { callAmount: 6500000, currency: 'RON', direction: 'received' } },
      { type: 'four_eyes_requested', actor: 'cm', payload: { reason: 'accept_above_threshold', callAmount: 6500000 } },
    ],
    approval: {
      id: 'APP-MC-DEMO-003-01', entity_type: 'margin_call_accept',
      requested_by: 'cm', requested_at: '2026-04-15T08:50:00Z', status: 'pending',
    },
  },
  {
    id: 'MC-DEMO-004', agreement_id: 'AGR-CAR-001', direction: 'received',
    call_date: '2026-04-16', exposure_amount: 7900000, collateral_value: 7200000,
    call_amount: 700000, currency: 'RON', issued_at: '2026-04-16T08:30:00Z',
    deadline_at: '2026-04-16T11:00:00Z', issued_by: 'cm', four_eyes_required: 0,
    events: [
      { type: 'issued',   actor: 'cm', payload: { callAmount: 700000, currency: 'RON', direction: 'received' } },
      { type: 'accepted', actor: 'cm', payload: { callAmount: 700000 } },
    ],
  },
  {
    id: 'MC-DEMO-005', agreement_id: 'AGR-DAN-001', direction: 'issued',
    call_date: '2026-04-12', exposure_amount: 4100000, collateral_value: 4090000,
    call_amount: 10000, currency: 'EUR', issued_at: '2026-04-12T08:40:00Z',
    deadline_at: '2026-04-12T11:00:00Z', issued_by: 'cm', four_eyes_required: 0,
    events: [
      { type: 'issued',    actor: 'cm', payload: { callAmount: 10000, currency: 'EUR' } },
      { type: 'cancelled', actor: 'tm', payload: { reason: 'Below MTA after intraday revaluation — call withdrawn.' } },
    ],
  },
];

const AUDIT_EVENTS = [
  { ts:'2026-04-01 09:12', user_name:'Treasury Manager', role:'Treasury', action:'repo created', object:'R-1024', prev_state:'Draft', next_state:'Approved', comment:'Trade terms captured and submitted.' },
  { ts:'2026-04-01 09:18', user_name:'Collateral Manager', role:'Collateral', action:'allocation approved', object:'R-1024', prev_state:'No collateral', next_state:'AST-005 allocated', comment:'Basket approved with single bond line.' },
  { ts:'2026-04-01 09:22', user_name:'Operations Analyst', role:'Operations', action:'settlement confirmed', object:'R-1021', prev_state:'Awaiting confirmation', next_state:'Confirmed', comment:'Custody confirmation received.' },
  { ts:'2026-04-01 11:05', user_name:'Risk Reviewer', role:'Risk', action:'margin alert triggered', object:'R-1024', prev_state:'In compliance', next_state:'Margin deficit', comment:'Recalculation identified collateral shortfall.' },
];

function seedDemoData(db, { includeUsers = true } = {}) {
  const reset = db.transaction(() => {
    db.exec(`
      DELETE FROM margin_call_events;
      DELETE FROM disputes;
      DELETE FROM approvals;
      DELETE FROM margin_calls;
      DELETE FROM collateral_agreements;
      DELETE FROM audit_events;
      DELETE FROM notifications;
      DELETE FROM repo_assets;
      DELETE FROM repos;
      DELETE FROM assets;
      ${includeUsers ? 'DELETE FROM users;' : ''}
    `);

    if (includeUsers) {
      const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)');
      for (const user of USERS) {
        insertUser.run(user.name, user.email, bcrypt.hashSync(user.password, 10), user.role);
      }
    }

    const insertAsset = db.prepare(`
      INSERT INTO assets (id,isin,name,issuer,type,currency,quantity,market_value,haircut,eligibility,custody,status,integration_json)
      VALUES (@id,@isin,@name,@issuer,@type,@currency,@quantity,@market_value,@haircut,@eligibility,@custody,@status,@integration_json)
    `);
    for (const asset of ASSETS) insertAsset.run(asset);

    const insertRepo = db.prepare(`
      INSERT INTO repos (id,counterparty,amount,currency,rate,start_date,maturity_date,state,required_collateral,posted_collateral,buffer,settlement,notes,integration_json)
      VALUES (@id,@counterparty,@amount,@currency,@rate,@start_date,@maturity_date,@state,@required_collateral,@posted_collateral,@buffer,@settlement,@notes,@integration_json)
    `);
    const insertRepoAsset = db.prepare('INSERT OR IGNORE INTO repo_assets (repo_id, asset_id) VALUES (?, ?)');
    for (const repo of REPOS) {
      const { assets, ...row } = repo;
      insertRepo.run(row);
      for (const assetId of assets) insertRepoAsset.run(repo.id, assetId);
    }

    const insertNotification = db.prepare('INSERT INTO notifications (severity, text, target) VALUES (@severity, @text, @target)');
    for (const notification of NOTIFICATIONS) insertNotification.run(notification);

    const insertAuditEvent = db.prepare(`
      INSERT INTO audit_events (ts, user_name, role, action, object, prev_state, next_state, comment)
      VALUES (@ts, @user_name, @role, @action, @object, @prev_state, @next_state, @comment)
    `);
    for (const event of AUDIT_EVENTS) insertAuditEvent.run(event);

    const insertAgreement = db.prepare(`
      INSERT INTO collateral_agreements
        (id, counterparty, agreement_type, governing_law, base_currency,
         threshold, minimum_transfer_amount, rounding, call_notice_deadline_time,
         four_eyes_threshold, status, effective_date)
      VALUES (@id, @counterparty, @agreement_type, @governing_law, @base_currency,
              @threshold, @minimum_transfer_amount, @rounding, @call_notice_deadline_time,
              @four_eyes_threshold, @status, @effective_date)
    `);
    for (const agr of AGREEMENTS) insertAgreement.run(agr);

    // Only seed margin calls if users exist — the event chain references user ids.
    const userRows = db.prepare('SELECT id, role FROM users').all();
    if (userRows.length === 0) return;

    const userByRole = {};
    for (const u of userRows) userByRole[u.role] = u.id;
    const actors = {
      cm: userByRole['Collateral Manager'],
      tm: userByRole['Treasury Manager'],
      approver: userByRole['Credit Approver'],
      system: null,
    };

    const insertCall = db.prepare(`
      INSERT INTO margin_calls
        (id, agreement_id, direction, call_date, exposure_amount, collateral_value,
         call_amount, currency, current_state, issued_by_user_id, issued_at,
         four_eyes_required, deadline_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
    `);
    const insertDispute = db.prepare(`
      INSERT INTO disputes
        (id, margin_call_id, opened_by_user_id, opened_at, reason_code,
         their_proposed_value, our_proposed_value, delta, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertApproval = db.prepare(`
      INSERT INTO approvals (id, entity_type, entity_id, requested_by_user_id, requested_at, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const setResolvedAt = db.prepare('UPDATE margin_calls SET resolved_at = ? WHERE id = ?');

    for (const call of MARGIN_CALLS) {
      const issuedBy = actors[call.issued_by] ?? null;
      insertCall.run(
        call.id, call.agreement_id, call.direction, call.call_date,
        call.exposure_amount, call.collateral_value, call.call_amount, call.currency,
        issuedBy, call.issued_at, call.four_eyes_required, call.deadline_at,
        call.issued_at, call.issued_at
      );

      // Build occurred_at timestamps walking forward in 1-minute steps from issued_at.
      const baseTime = new Date(call.issued_at).getTime();
      let stepSeconds = 0;
      let lastEvent = null;
      for (const ev of call.events) {
        const actorId = actors[ev.actor];
        const actorType = ev.actor === 'system' ? 'system' : 'user';
        const occurredAt = new Date(baseTime + stepSeconds * 1000).toISOString();
        stepSeconds += 60;
        lastEvent = appendEvent(db, {
          marginCallId: call.id,
          eventType: ev.type,
          actor: { id: actorId, type: actorType },
          payload: ev.payload ?? {},
          occurredAt,
        });
        if (lastEvent.newState === 'settled' || lastEvent.newState === 'resolved') {
          setResolvedAt.run(lastEvent.occurredAt, call.id);
        }
      }

      if (call.dispute) {
        const d = call.dispute;
        insertDispute.run(
          d.id, call.id, actors[d.opened_by] ?? null, d.opened_at, d.reason_code,
          d.their_proposed_value, d.our_proposed_value, d.delta, d.status
        );
      }
      if (call.approval) {
        const a = call.approval;
        insertApproval.run(
          a.id, a.entity_type, call.id, actors[a.requested_by] ?? null,
          a.requested_at, a.status
        );
      }
    }
  });

  reset();
}

module.exports = { seedDemoData, USERS, AGREEMENTS, MARGIN_CALLS };
