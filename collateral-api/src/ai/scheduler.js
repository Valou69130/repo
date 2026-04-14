// Proactive AI scheduler — runs analyses on a clock and pushes results as
// system notifications so staff see briefings before they log in.
// Gracefully no-ops when AI_ENABLED=false.

const { isEnabled } = require('./client');
const { analysePortfolio } = require('./agents/marginIntelligence');
const { correlate } = require('./agents/exceptionCorrelator');

const SYSTEM_USER = { name: 'AI Scheduler', role: 'System' };

async function runMorningBrief(db) {
  if (!isEnabled()) return;
  console.log('[ai-scheduler] running morning brief');
  try {
    const [portfolio, exceptions] = await Promise.allSettled([
      analysePortfolio({ db }),
      correlate({ db }),
    ]);

    const brief = portfolio.status === 'fulfilled' ? portfolio.value.text : null;
    const alerts = exceptions.status === 'fulfilled' ? exceptions.value.text : null;

    if (brief) {
      // Determine severity from the AI text — look for Critical/Warning keywords
      const severity = /critical|breach|deficit.*urgent/i.test(brief) ? 'Critical'
        : /warning|attention|monitor/i.test(brief) ? 'Warning'
        : 'Info';
      db.prepare('INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)')
        .run(severity, `[AI Morning Brief] ${brief.slice(0, 500)}`, 'dashboard');
    }
    if (alerts) {
      db.prepare('INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)')
        .run('Info', `[AI Exception Brief] ${alerts.slice(0, 500)}`, 'dashboard');
    }
    console.log('[ai-scheduler] morning brief posted');
  } catch (err) {
    console.error('[ai-scheduler] morning brief failed:', err.message);
  }
}

async function runMaturityAlert(db) {
  if (!isEnabled()) return;
  try {
    const { execute } = require('./tools');
    const wall = execute('get_maturity_wall', { days: 10 }, db);
    const highRisk = wall.maturingRepos.filter(r => r.rolloverRisk === 'HIGH');
    if (highRisk.length === 0) return;
    const ids = highRisk.map(r => r.id).join(', ');
    db.prepare('INSERT INTO notifications (severity, text, target) VALUES (?, ?, ?)')
      .run('Warning', `[AI] Rollover risk: ${highRisk.length} repo(s) mature in 10 days with insufficient free inventory — ${ids}`, 'repos');
    console.log('[ai-scheduler] maturity alert posted for:', ids);
  } catch (err) {
    console.error('[ai-scheduler] maturity alert failed:', err.message);
  }
}

// Milliseconds until next occurrence of HH:MM in local time
function msUntilNext(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function start(db) {
  if (!isEnabled()) {
    console.log('[ai-scheduler] disabled (AI_ENABLED=false)');
    return;
  }

  // Morning brief at 07:30 every day
  const scheduleMorning = () => {
    const delay = msUntilNext(7, 30);
    console.log(`[ai-scheduler] morning brief scheduled in ${Math.round(delay / 60000)}m`);
    setTimeout(() => {
      runMorningBrief(db);
      setInterval(() => runMorningBrief(db), 24 * 60 * 60 * 1000);
    }, delay);
  };
  scheduleMorning();

  // Maturity wall check every 6 hours
  setInterval(() => runMaturityAlert(db), 6 * 60 * 60 * 1000);
  // Run once on startup after a short delay
  setTimeout(() => runMaturityAlert(db), 30 * 1000);
}

module.exports = { start, runMorningBrief, runMaturityAlert };
