/* TDS 26T2 term review — renderers.
 *
 * Carries over the chart idiom from mynkpdr.github.io/datastories/tds-analysis: D3 v7
 * drawing into `.viz` divs sized from `offsetWidth`, a single shared `#tooltip` driven
 * either imperatively (SVG marks) or declaratively via `data-tip-title` /
 * `data-tip-body` (HTML marks), and HTML-grid components for bar rows, rhythm strips
 * and heatmaps.
 *
 * The page computes no statistics. Every number comes from `window.STORY`, which
 * `export_story.py` generates with one named query per figure — the `panel-source`
 * line under each panel names that query.
 */

const D = window.STORY;

/* ============================================================ UTILITY ==== */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const integerFormatter = new Intl.NumberFormat('en-IN');
const decimalFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const formatPercent = (value) => `${decimalFormatter.format(value)}%`;
const escapeAttribute = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS_IN_DAY = Array.from({ length: 24 }, (_, hour) => hour);

/** Minutes -> the shortest sensible human unit. */
const formatMinutes = (value) => {
  if (value == null) return '—';
  if (value < 60) return `${Math.round(value)} min`;
  if (value < 60 * 48) return `${decimalFormatter.format(value / 60)} hrs`;
  return `${decimalFormatter.format(value / 1440)} days`;
};

function getCssVariable(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function resolveColorToken(str) {
  // Resolve both var(--foo) and raw --foo tokens used in chart code.
  const value = String(str || '').trim();
  if (value.startsWith('--')) return getCssVariable(value);
  const m = value.match(/var\((--[^),\s]+)(?:,[^)]+)?\)/);
  return m ? getCssVariable(m[1]) : value;
}

/* Tooltip: one element, shared by every chart on the page. */
const tipEl = $('#tooltip'), tipTitle = $('#tip-title'), tipBody = $('#tip-body');
function showTooltip(event, title, body) {
  tipTitle.textContent = title;
  tipBody.innerHTML = body || '';
  tipEl.classList.add('vis');
  positionTooltip(event);
}
function positionTooltip(event) {
  const margin = 14;
  const offset = 16;
  const rect = tipEl.getBoundingClientRect();
  let left = event.clientX + offset;
  let top = event.clientY + offset;
  if (left + rect.width + margin > window.innerWidth) left = event.clientX - rect.width - offset;
  if (top + rect.height + margin > window.innerHeight) top = event.clientY - rect.height - offset;
  tipEl.style.left = Math.max(margin, left) + 'px';
  tipEl.style.top = Math.max(margin, top) + 'px';
}
function hideTooltip() { tipEl.classList.remove('vis'); }
document.addEventListener('mousemove', (e) => { if (tipEl.classList.contains('vis')) positionTooltip(e); });

let activeTipTarget = null;
function getTooltipTarget(event) {
  return event.target instanceof Element ? event.target.closest('[data-tip-title]') : null;
}
document.addEventListener('pointerover', (event) => {
  const target = getTooltipTarget(event);
  if (!target) return;
  activeTipTarget = target;
  showTooltip(event, target.dataset.tipTitle, target.dataset.tipBody);
});
document.addEventListener('pointermove', (event) => {
  const target = getTooltipTarget(event);
  if (!target) return;
  if (target !== activeTipTarget) {
    activeTipTarget = target;
    showTooltip(event, target.dataset.tipTitle, target.dataset.tipBody);
    return;
  }
  positionTooltip(event);
});
document.addEventListener('pointerout', (event) => {
  if (!activeTipTarget) return;
  if (event.relatedTarget instanceof Node && activeTipTarget.contains(event.relatedTarget)) return;
  activeTipTarget = null;
  hideTooltip();
});

/* ===================================================== RENDER HELPERS ==== */

function renderMetricCards(containerSelector, metrics) {
  $(containerSelector).innerHTML = metrics.map(metric => `
    <div class="metric-box ${metric.cls || ''}">
      <div class="num">${metric.num}</div>
      <div class="lbl">${metric.lbl}</div>
    </div>
  `).join('');
}

function renderHeroStats(rows) {
  $('#hero-stats').insertAdjacentHTML('beforeend', rows.map(row => `
    <div class="hero-stat-row">
      <span class="hero-stat-label">${row.lbl}</span>
      <span class="hero-stat-val ${row.cls || ''}">${row.val}</span>
    </div>
  `).join(''));
}

/** Horizontal HTML bar rows, the reference's `.brow` component. */
function renderBarRows(container, rows, options = {}) {
  const { wide, mono } = options;
  const max = options.max ?? (Math.max(...rows.map(r => r.value)) || 1);
  const el = $(container);
  el.innerHTML = `<div class="bar-rows">${rows.map(row => `
    <div class="brow ${wide ? 'brow-wide' : ''}">
      <div class="brow-name ${mono ? 'is-mono' : ''}" title="${escapeAttribute(row.name)}">${row.name}</div>
      <div class="brow-track"
           data-tip-title="${escapeAttribute(row.tipTitle || row.name)}"
           data-tip-body="${escapeAttribute(row.tipBody || '')}">
        <div class="brow-fill" style="width:${row.value / max * 100}%;${row.hollow
          ? `background:transparent;box-shadow:inset 0 0 0 1.5px ${resolveColorToken(row.color)}`
          : `background:${resolveColorToken(row.color)}`}"></div>
      </div>
      <div class="brow-num">${row.label}</div>
    </div>`).join('')}</div>`;
}

/** Sortable table, styled like the reference's `.table-wrap`. */
function renderTable(container, rows, columns, initial = {}) {
  let sortKey = initial.sort ?? columns[0].key;
  let sortDesc = initial.desc ?? true;
  const el = $(container);

  const draw = () => {
    const sorted = [...rows].sort((a, b) => {
      const [x, y] = [a[sortKey], b[sortKey]];
      const cmp = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x ?? '').localeCompare(String(y ?? ''));
      return sortDesc ? -cmp : cmp;
    });
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${columns.map(col => `
        <th class="sortable" data-key="${col.key}"
            aria-sort="${col.key === sortKey ? (sortDesc ? 'descending' : 'ascending') : 'none'}"
        >${col.label}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map(row => `<tr>${columns.map(col => `
        <td class="${col.cls || ''}">${col.fmt ? col.fmt(row[col.key], row) : (row[col.key] ?? '—')}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    el.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (key === sortKey) sortDesc = !sortDesc;
      else { sortKey = key; sortDesc = true; }
      draw();
    }));
  };
  draw();
}

/* ======================================================= CHAPTER 00 ===== */

function renderHero() {
  const head = D.headline, endpoints = D.marks_from_endpoints;
  const heavy = D.inversion.find(r => r.band === '31+');
  const clean = D.inversion.find(r => r.band === 'never');
  renderHeroStats([
    { lbl: 'Students enrolled', val: integerFormatter.format(head.enrolled), cls: 'accent' },
    { lbl: 'Saved attempts analysed', val: integerFormatter.format(head.attempts) },
    { lbl: 'Per-question scores', val: integerFormatter.format(head.question_scores) },
    { lbl: 'Saves the portal refused', val: integerFormatter.format(head.rejected_saves), cls: 'bad' },
    { lbl: 'Students who used a shared endpoint', val: integerFormatter.format(endpoints.students), cls: 'bad' },
    { lbl: 'Assignment marks earned on one', val: formatPercent(endpoints.pct), cls: 'bad' },
    { lbl: 'Never used one — assignments / exam', val: `${clean.ga_pct}% / ${clean.roe_pct}%`, cls: 'good' },
    { lbl: 'Heaviest users — assignments / exam', val: `${heavy.ga_pct}% / ${heavy.roe_pct}%`, cls: 'bad' },
    { lbl: 'Forum threads in the term', val: integerFormatter.format(head.forum_topics) },
    { lbl: 'Of them administrative friction', val: formatPercent(D.forum_family[0].pct), cls: 'bad' },
  ]);
}

function renderMetricStrip() {
  const ga0 = D.effort.find(r => r.ga === 'ga0');
  const ga8 = D.effort.find(r => r.ga === 'ga8');
  renderMetricCards('#metric-strip', [
    { num: integerFormatter.format(D.headline.enrolled), lbl: 'Students enrolled in 26T2', cls: 'accent' },
    { num: integerFormatter.format(D.headline.attempts), lbl: 'Saved attempts across 13 components', cls: '' },
    { num: `${decimalFormatter.format(ga0.med_span_min / 60)} hrs`, lbl: 'Median work on GA0 — first to last save', cls: 'good' },
    { num: `${ga8.med_span_min} min`, lbl: 'Median work on GA8 — the same measure', cls: 'bad' },
    { num: integerFormatter.format(D.headline.rejected_saves), lbl: 'Saves the portal refused', cls: 'roe' },
    { num: formatPercent(D.marks_from_endpoints.pct), lbl: 'Assignment marks earned on a shared URL', cls: 'bad' },
  ]);
}

function renderEffortChart() {
  const el = $('#effort-chart');
  const data = D.effort;
  const W = el.offsetWidth || 480, H = 240;
  const margin = { top: 22, right: 22, bottom: 46, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand().domain(data.map(d => d.ga)).range([margin.left, W - margin.right]).padding(0.24);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.med_span_min) * 1.1]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0).tickFormat(d => d.toUpperCase())).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d >= 60 ? `${Math.round(d / 60)}h` : `${d}m`)).select('.domain').remove();
  const heat = d3.scaleLinear().domain([0, data.length - 1])
    .range([resolveColorToken('--good'), resolveColorToken('--bad')]);
  svg.selectAll('rect').data(data).join('rect')
    .attr('x', d => x(d.ga)).attr('y', d => y(d.med_span_min))
    .attr('width', x.bandwidth()).attr('height', d => y(0) - y(d.med_span_min)).attr('rx', 4)
    .attr('fill', (d, i) => heat(i)).attr('opacity', .88)
    .on('mousemove', (event, d) => showTooltip(event, d.ga.toUpperCase(),
      `Median work: <strong>${formatMinutes(d.med_span_min)}</strong><br>Median saves: ${d.med_saves}<br>${integerFormatter.format(d.students)} students`))
    .on('mouseleave', hideTooltip);
  svg.selectAll('.val').data(data).join('text').attr('class', 'chart-label')
    .attr('x', d => x(d.ga) + x.bandwidth() / 2).attr('y', d => y(d.med_span_min) - 6)
    .attr('text-anchor', 'middle').text(d => d.med_span_min >= 60 ? `${Math.round(d.med_span_min / 60)}h` : `${d.med_span_min}m`);
}

function renderParticipationChart() {
  const el = $('#participation-chart');
  const data = D.participation.filter(d => d.component !== 'bootcamp');
  const W = el.offsetWidth || 480, H = 240;
  const margin = { top: 22, right: 58, bottom: 46, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scalePoint().domain(data.map(d => d.component)).range([margin.left, W - margin.right]).padding(0.5);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.opened, d.submitted)) * 1.1]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5)).select('.domain').remove();

  [['opened', '--text-muted', 'opened'], ['submitted', '--ga', 'submitted']].forEach(([key, token, label]) => {
    const color = resolveColorToken(token);
    const line = d3.line().x(d => x(d.component)).y(d => y(d[key])).curve(d3.curveMonotoneX);
    svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('d', line);
    svg.selectAll(`.pt-${key}`).data(data).join('circle').attr('class', `pt-${key}`)
      .attr('cx', d => x(d.component)).attr('cy', d => y(d[key])).attr('r', 3.6).attr('fill', color)
      .on('mousemove', (event, d) => showTooltip(event, d.component.toUpperCase(),
        `${integerFormatter.format(d.opened)} opened the page<br>${integerFormatter.format(d.submitted)} submitted (${formatPercent(d.pct_enrolled)} of enrolled)<br>Portal average at submission: ${formatPercent(d.avg_score_pct)}`))
      .on('mouseleave', hideTooltip);
    const last = data.at(-1);
    svg.append('text').attr('class', 'chart-label').attr('fill', color)
      .attr('x', x(last.component) + 8).attr('y', y(last[key]) + 4).text(label);
  });
}

/* ======================================================= CHAPTER 01 ===== */

// Authored narrative for the five shared-endpoint bands. The numbers on each card come
// from the `inversion` query; only the name, description and recommendation are written.
const COHORT_COPY = {
  never: {
    name: 'Did The Work',
    tag: 'clean',
    color: 'var(--c-clean)',
    desc: 'Never submitted a shared endpoint on any question. Their assignment average is the lowest of the five bands — and it is the only one that predicts their exam performance, to within five points.',
    action: 'These students were <strong>penalised by the design</strong>: they did the work and finished 27 points below the students who did not. Any fix has to start by making their marks competitive again — which means making the shortcut stop working, not policing it.',
  },
  '1-5': {
    name: 'Tried It Once',
    tag: 'dabbler',
    color: 'var(--c-dabbler)',
    desc: 'Used a shared endpoint on a handful of questions. The smallest band, and the highest exam average of anyone — these are capable students who reached for a shortcut on the questions that were tedious rather than hard.',
    action: 'The most informative band. They show the shortcut was <strong>convenience, not dependence</strong>: their capability held up. Per-student question data would keep them working without changing anything else about how they study.',
  },
  '6-15': {
    name: 'Regular Users',
    tag: 'regular',
    color: 'var(--c-regular)',
    desc: 'A shared endpoint on roughly one assignment\'s worth of questions. Assignment marks near 90%, exam marks below the students who never used one at all.',
    action: 'The gap opens here: <strong>33 points between what the assignments said and what the exam found.</strong> This is the band where marks stopped carrying information, and where an injected-change question would have shown it immediately.',
  },
  '16-30': {
    name: 'Heavy Users',
    tag: 'heavy',
    color: 'var(--c-heavy)',
    desc: 'Between one and three assignments answered entirely through shared services. Near-perfect assignment marks, and an exam average more than eight points below the students who never used one.',
    action: 'By this point the assignments are <strong>anti-predictive</strong>. No amount of grading rigour recovers signal from a question whose answer is a link; the question itself has to change.',
  },
  '31+': {
    name: 'Fully Routed',
    tag: 'total',
    color: 'var(--c-total)',
    desc: 'Thirty-one or more questions answered with somebody else\'s deployed service. The highest assignment average in the term and the lowest exam average of any band.',
    action: 'The clearest evidence that <strong>the marks were measuring endpoint access.</strong> These students beat everyone on assignments and lost to the abstainers on the exam — the same students, the same term, two instruments disagreeing by 41 points.',
  },
};

function cohortRows() {
  const order = ['never', '1-5', '6-15', '16-30', '31+'];
  return order.map(band => {
    const row = D.inversion.find(r => r.band === band);
    return { ...row, ...COHORT_COPY[band], gap: +(row.ga_pct - row.roe_pct).toFixed(1) };
  });
}

/** Dumbbell rows: one cohort per row, its exam score and assignment score as two dots
 *  joined by a bar.
 *
 * A slope chart was the first attempt and it fanned: four of the five cohorts sit within
 * two points of each other on the assignment axis, so their left-hand ends piled up and
 * the labels had to be nudged apart. Rows fix that. Reading top to bottom is reading the
 * axis -- shared-endpoint use rising -- and the bar between the dots is the gap itself,
 * so it getting longer down the page *is* the finding, at a glance and to scale.
 */
function renderCohortDumbbell() {
  const el = $('#cohort-dumbbell');
  const data = cohortRows();
  const W = el.offsetWidth || 700;
  const rowH = 52;
  const margin = { top: 40, right: 92, bottom: 34, left: 186 };
  const H = margin.top + data.length * rowH + margin.bottom;
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([45, 95]).range([margin.left, W - margin.right]);

  x.ticks(6).forEach(t => {
    svg.append('line').attr('class', 'grid-line')
      .attr('x1', x(t)).attr('x2', x(t)).attr('y1', margin.top - 14).attr('y2', H - margin.bottom);
    svg.append('text').attr('class', 'chart-label').attr('x', x(t)).attr('y', H - margin.bottom + 16)
      .attr('text-anchor', 'middle').text(t + '%');
  });

  svg.append('text').attr('class', 'chart-label')
    .attr('x', margin.left).attr('y', 16).text('exam ← → assignments');
  svg.append('text').attr('class', 'chart-label')
    .attr('x', W - margin.right + 16).attr('y', 16).text('gap');

  data.forEach((d, i) => {
    const cy = margin.top + i * rowH + rowH / 2;
    const color = resolveColorToken(d.color);
    const row = svg.append('g').style('cursor', 'default')
      .on('mousemove', (event) => showTooltip(event, d.name,
        `${integerFormatter.format(d.students)} students · ${d.band === 'never' ? 'never used a shared endpoint' : d.band + ' shared-endpoint questions'}<br>Graded assignments: <strong>${formatPercent(d.ga_pct)}</strong><br>Timed exam: <strong>${formatPercent(d.roe_pct)}</strong><br>The assignments read <strong>${formatPercent(d.gap)}</strong> higher`))
      .on('mouseleave', hideTooltip);

    row.append('rect').attr('x', 0).attr('y', cy - rowH / 2).attr('width', W).attr('height', rowH)
      .attr('fill', 'transparent');
    row.append('text').attr('x', margin.left - 16).attr('y', cy - 2).attr('text-anchor', 'end')
      .attr('fill', color).attr('font-size', 12.5).attr('font-weight', '600')
      .attr('font-family', 'var(--font-sans)').text(d.name);
    row.append('text').attr('class', 'chart-label').attr('x', margin.left - 16).attr('y', cy + 13)
      .attr('text-anchor', 'end')
      .text(`${d.band === 'never' ? 'never used one' : d.band + ' questions'} · ${integerFormatter.format(d.students)}`);

    // The bar is the gap. Exam score on the left end, assignment score on the right.
    row.append('line').attr('x1', x(d.roe_pct)).attr('x2', x(d.ga_pct))
      .attr('y1', cy).attr('y2', cy)
      .attr('stroke', color).attr('stroke-width', 9).attr('opacity', .38)
      .attr('stroke-linecap', 'round');
    row.append('circle').attr('cx', x(d.roe_pct)).attr('cy', cy).attr('r', 5.5)
      .attr('fill', 'rgba(255,255,255,.55)');
    row.append('circle').attr('cx', x(d.ga_pct)).attr('cy', cy).attr('r', 6.5)
      .attr('fill', color).attr('stroke', resolveColorToken('--card')).attr('stroke-width', 1.5);
    row.append('text').attr('x', x(d.roe_pct) - 11).attr('y', cy + 4).attr('text-anchor', 'end')
      .attr('class', 'chart-label').attr('fill', resolveColorToken('--text-sub'))
      .text(formatPercent(d.roe_pct));
    row.append('text').attr('x', x(d.ga_pct) + 12).attr('y', cy + 4)
      .attr('fill', color).attr('font-size', 11.5).attr('font-weight', '600')
      .attr('font-family', 'var(--font-mono)').text(formatPercent(d.ga_pct));
    row.append('text').attr('x', W - margin.right + 16).attr('y', cy + 4)
      .attr('fill', d.gap > 30 ? resolveColorToken('--bad') : resolveColorToken('--text-muted'))
      .attr('font-size', 12).attr('font-weight', '600').attr('font-family', 'var(--font-mono)')
      .text(`+${decimalFormatter.format(d.gap)}`);
  });
}

/** Cohort cards: narrative only.
 *
 * The first version repeated the chart above -- three stat tiles and two score bars per
 * card -- which made the cards tall, ragged and redundant. The dumbbell carries the
 * numbers now, so a card carries one number (the gap it is about) and the reading.
 */
function renderCohortCards() {
  $('#cohort-cards').innerHTML = cohortRows().map(c => `
    <div class="arch-card" style="--cohort-color:${c.color}">
      <div class="arch-meta">
        <span class="arch-tag">${c.tag}</span>
        <span class="arch-count">${integerFormatter.format(c.students)} students</span>
      </div>
      <div class="arch-name">${c.name}</div>
      <div class="arch-gap">
        <span class="arch-gap-num">+${decimalFormatter.format(c.gap)}</span>
        <span class="arch-gap-lbl">${c.gap < 10
          ? 'points apart — the two<br>measures broadly agree'
          : 'points the assignments<br>read above the exam'}</span>
      </div>
      <div class="arch-desc">${c.desc}</div>
      <div class="arch-intervention">
        <div class="int-label">↗ What this band needs</div>
        <div class="int-text">${c.action}</div>
      </div>
    </div>
  `).join('');
}

function renderInversionScatter() {
  const el = $('#inversion-scatter');
  const data = D.inversion_scatter;
  const W = el.offsetWidth || 700, H = 420;
  const margin = { top: 28, right: 26, bottom: 62, left: 62 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, 100]).range([margin.left, W - margin.right]);
  const y = d3.scaleLinear().domain([0, 100]).range([H - margin.bottom, margin.top]);

  svg.selectAll('.gy').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => d + '%')).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%')).select('.domain').remove();
  svg.append('text').attr('class', 'chart-label').attr('x', W / 2).attr('y', H - 4)
    .attr('text-anchor', 'middle').text('Graded-assignment average');
  svg.append('text').attr('class', 'chart-label').attr('transform', 'rotate(-90)')
    .attr('x', -H / 2).attr('y', 14).attr('text-anchor', 'middle').text('ROE score');

  svg.append('line').attr('class', 'grid-line').attr('stroke-dasharray', '5,5')
    .attr('stroke', resolveColorToken('--border-bright'))
    .attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(100)).attr('y2', y(100));
  svg.append('text').attr('class', 'chart-label').attr('x', x(100)).attr('y', y(100) - 8)
    .attr('text-anchor', 'end').text('equal performance');

  const clean = resolveColorToken('--c-clean'), used = resolveColorToken('--c-total');
  svg.selectAll('circle').data(data).join('circle')
    .attr('cx', d => x(d.ga_pct)).attr('cy', d => y(d.roe_pct)).attr('r', 3.4)
    .attr('fill', d => d.shared_questions === 0 ? clean : used)
    .attr('opacity', .55)
    .on('mousemove', (event, d) => showTooltip(event,
      d.shared_questions === 0 ? 'Never used a shared endpoint' : `${d.shared_questions} shared-endpoint answers`,
      `Assignments: <strong>${formatPercent(d.ga_pct)}</strong><br>ROE: <strong>${formatPercent(d.roe_pct)}</strong>`))
    .on('mouseleave', hideTooltip);

  const leg = svg.append('g').attr('transform', `translate(${margin.left + 6},${margin.top - 10})`);
  [['Never used one', clean], ['Used a shared endpoint', used]].forEach(([label, color], i) => {
    const g = leg.append('g').attr('transform', `translate(${i * 170},0)`);
    g.append('circle').attr('cx', 5).attr('cy', -4).attr('r', 4).attr('fill', color);
    g.append('text').attr('x', 14).attr('class', 'chart-label').text(label);
  });
}

/* ======================================================= CHAPTER 02 ===== */

function renderAssessmentMetrics() {
  const ga0 = D.effort.find(r => r.ga === 'ga0');
  const ga8 = D.effort.find(r => r.ga === 'ga8');
  renderMetricCards('#assessment-metrics', [
    { num: formatPercent(ga0.med_first_pct), lbl: 'GA0 · median score on the first save', cls: 'good' },
    { num: formatPercent(ga8.med_first_pct), lbl: 'GA8 · median score on the first save', cls: 'bad' },
    { num: formatPercent(ga8.pct_95_first), lbl: 'GA8 · share scoring 95%+ on the first save', cls: 'bad' },
    { num: formatPercent(ga8.pct_one_save), lbl: 'GA8 · share who saved exactly once', cls: 'roe' },
    { num: formatPercent(ga8.med_best_pct), lbl: 'GA8 · median best score', cls: 'accent' },
    { num: `${ga0.med_saves} → ${ga8.med_saves}`, lbl: 'Median saves per student, GA0 to GA8', cls: 'ga' },
  ]);
}

function renderEffortArcChart() {
  const el = $('#effort-arc-chart');
  const data = D.effort;
  const W = el.offsetWidth || 480, H = 250;
  const margin = { top: 24, right: 20, bottom: 58, left: 50 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scalePoint().domain(data.map(d => d.ga)).range([margin.left, W - margin.right]).padding(0.4);
  const y = d3.scaleLinear().domain([0, 100]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0).tickFormat(d => d.replace('ga', ''))).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%')).select('.domain').remove();

  const series = [
    { key: 'med_first_pct', label: 'Median score, first save', token: '--bad' },
    { key: 'med_best_pct', label: 'Median best score', token: '--good' },
    { key: 'pct_95_first', label: '95%+ on first save', token: '--accent' },
    { key: 'pct_one_save', label: 'Saved exactly once', token: '--project' },
  ];
  series.forEach(s => {
    const color = resolveColorToken(s.token);
    svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
      .attr('d', d3.line().x(d => x(d.ga)).y(d => y(d[s.key])).curve(d3.curveMonotoneX));
    svg.selectAll(`.p-${s.key}`).data(data).join('circle').attr('class', `p-${s.key}`)
      .attr('cx', d => x(d.ga)).attr('cy', d => y(d[s.key])).attr('r', 3.2).attr('fill', color)
      .on('mousemove', (event, d) => showTooltip(event, `${d.ga.toUpperCase()} · ${s.label}`,
        series.map(t => `${t.label}: <strong>${formatPercent(d[t.key])}</strong>`).join('<br>')))
      .on('mouseleave', hideTooltip);
  });
  const leg = svg.append('g').attr('transform', `translate(${margin.left},${H - 14})`);
  series.forEach((s, i) => {
    const g = leg.append('g').attr('transform', `translate(${(i % 2) * 200},${Math.floor(i / 2) * 13})`);
    g.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('y', -8).attr('fill', resolveColorToken(s.token));
    g.append('text').attr('x', 13).attr('class', 'chart-label').text(s.label);
  });
}

function renderTwoTermsChart() {
  const el = $('#two-terms-chart');
  const byGa = {};
  D.effort_two_terms.forEach(r => ((byGa[r.ga] ??= {})[r.term] = r.med_span_min));
  const data = Object.entries(byGa).filter(([, v]) => v['26T1'] && v['26T2'])
    .map(([ga, v]) => ({ ga, t1: v['26T1'], t2: v['26T2'] }));
  const W = el.offsetWidth || 480, H = 250;
  const margin = { top: 22, right: 20, bottom: 58, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x0 = d3.scaleBand().domain(data.map(d => d.ga)).range([margin.left, W - margin.right]).padding(0.22);
  const x1 = d3.scaleBand().domain(['t1', 't2']).range([0, x0.bandwidth()]).padding(0.08);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.t1, d.t2)) * 1.08]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x0).tickSize(0).tickFormat(d => d.toUpperCase())).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d >= 60 ? `${Math.round(d / 60)}h` : `${d}m`)).select('.domain').remove();

  const groups = svg.selectAll('.grp').data(data).join('g').attr('transform', d => `translate(${x0(d.ga)},0)`);
  [['t1', '--text-muted', '26T1 (Jan)'], ['t2', '--bad', '26T2 (May)']].forEach(([key, token, label]) => {
    groups.append('rect').attr('x', x1(key)).attr('y', d => y(d[key]))
      .attr('width', x1.bandwidth()).attr('height', d => y(0) - y(d[key])).attr('rx', 3)
      .attr('fill', resolveColorToken(token)).attr('opacity', .88)
      .on('mousemove', (event, d) => showTooltip(event, `${d.ga.toUpperCase()} · ${label}`,
        `26T1: <strong>${formatMinutes(d.t1)}</strong><br>26T2: <strong>${formatMinutes(d.t2)}</strong>`))
      .on('mouseleave', hideTooltip);
  });
  const leg = svg.append('g').attr('transform', `translate(${margin.left + 4},${H - 12})`);
  [['26T1 (Jan)', '--text-muted'], ['26T2 (May)', '--bad']].forEach(([label, token], i) => {
    const g = leg.append('g').attr('transform', `translate(${i * 110},0)`);
    g.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('y', -9).attr('fill', resolveColorToken(token));
    g.append('text').attr('x', 13).attr('class', 'chart-label').text(label);
  });
}

/** Each component's FINALISED average over the term, with the portal score alongside
 *  wherever the two disagree.
 *
 * Plotting the portal score alone was wrong: the portal only ever showed P2's
 * 2.5-of-12.5 participation share, which put it at 19.9% and made the term's
 * strongest-scoring component look like its weakest. The solid dot is the mark students
 * actually hold; the hollow dot is what the portal told them at submission.
 */
function renderComponentTimeline() {
  const el = $('#component-timeline');
  const windows = new Map(D.calendar.map(c => [c.component, c]));
  const kindOf = (name) => name.startsWith('ga') ? 'ga'
    : name === 'roe' ? 'roe'
      : (name === 'p1' || name === 'p2') ? 'project' : 'other';
  const data = D.component_scores
    .map(c => ({ ...c, ...windows.get(c.component), kind: kindOf(c.component) }))
    .filter(d => d.first_real_save)
    .map(d => ({ ...d, date: new Date(d.first_real_save), shown: d.final_avg ?? d.portal_avg }))
    .sort((a, b) => a.date - b.date);

  const W = el.offsetWidth || 900, H = 340;
  const margin = { top: 30, right: 54, bottom: 66, left: 60 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleTime().domain(d3.extent(data, d => d.date)).range([margin.left, W - margin.right]);
  const y = d3.scaleLinear().domain([0, 100]).range([H - margin.bottom, margin.top]);
  const rScale = d3.scaleSqrt().domain([0, d3.max(data, d => d.submitters)]).range([4, 15]);
  // GA8 and P2 both opened on 18 Aug, GA3 and P1 both on 3 Jul, so plotting on the raw
  // date buries one dot under the other. Nudge same-day components apart.
  const sameDay = {};
  data.forEach(d => ((sameDay[d.first_real_save] ??= []).push(d)));
  data.forEach(d => {
    const group = sameDay[d.first_real_save];
    const i = group.indexOf(d);
    d.px = x(d.date) + (group.length > 1 ? (i - (group.length - 1) / 2) * 26 : 0);
  });
  const colorMap = {
    ga: resolveColorToken('--ga'), roe: resolveColorToken('--roe'),
    project: resolveColorToken('--project'), other: resolveColorToken('--text-muted'),
  };

  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(7).tickFormat(d3.timeFormat('%d %b'))).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%')).select('.domain').remove();
  svg.append('text').attr('class', 'chart-label').attr('transform', 'rotate(-90)')
    .attr('x', -H / 2).attr('y', 14).attr('text-anchor', 'middle').text('Finalised average mark');

  // Connector from the portal score to the finalised mark, where they differ.
  data.filter(d => d.final_avg != null && Math.abs(d.shift) >= 3).forEach(d => {
    svg.append('line').attr('x1', d.px).attr('x2', d.px)
      .attr('y1', y(d.portal_avg)).attr('y2', y(d.final_avg))
      .attr('stroke', colorMap[d.kind]).attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3,3').attr('opacity', .7);
    svg.append('circle').attr('cx', d.px).attr('cy', y(d.portal_avg)).attr('r', 4)
      .attr('fill', 'none').attr('stroke', colorMap[d.kind]).attr('stroke-width', 1.5)
      .attr('opacity', .8);
    // Flip the label inside the plot when the point sits near the right edge.
    const flip = d.px > W - margin.right - 96;
    svg.append('text').attr('class', 'chart-label')
      .attr('x', d.px + (flip ? -9 : 9)).attr('text-anchor', flip ? 'end' : 'start')
      .attr('y', y(d.portal_avg) + 4).attr('fill', resolveColorToken('--text-muted'))
      .text(`portal ${formatPercent(d.portal_avg)}`);
  });

  svg.selectAll('.pt').data(data).join('circle').attr('class', 'pt')
    .attr('cx', d => d.px).attr('cy', d => y(d.shown)).attr('r', d => rScale(d.submitters))
    .attr('fill', d => colorMap[d.kind]).attr('opacity', .7)
    .attr('stroke', d => colorMap[d.kind]).attr('stroke-width', 1.5)
    // Components with no finalised mark yet are drawn hollow, so they are not read as final.
    .attr('fill-opacity', d => d.final_avg == null ? .12 : .7)
    .attr('stroke-dasharray', d => d.final_avg == null ? '3,2' : null)
    .on('mousemove', (event, d) => showTooltip(event, d.title || d.component.toUpperCase(),
      `${integerFormatter.format(d.submitters)} students submitted<br>`
      + (d.final_avg == null
        ? `Portal average: <strong>${formatPercent(d.portal_avg)}</strong><br><strong>Not yet finalised</strong> — the marks sheet carries no mark for this component`
        : `Finalised average: <strong>${formatPercent(d.final_avg)}</strong><br>Portal showed: ${formatPercent(d.portal_avg)}${Math.abs(d.shift) >= 3 ? ` <strong>(${d.shift > 0 ? '+' : ''}${decimalFormatter.format(d.shift)} after offline marking)</strong>` : ''}`)))
    .on('mouseleave', hideTooltip);

  svg.selectAll('.lbl').data(data).join('text').attr('class', 'chart-label')
    .attr('x', d => d.px).attr('y', d => y(d.shown) - rScale(d.submitters) - 5)
    .attr('text-anchor', 'middle').attr('fill', d => colorMap[d.kind])
    .attr('stroke', resolveColorToken('--card')).attr('stroke-width', 3).attr('paint-order', 'stroke')
    .text(d => d.component.toUpperCase());

  const leg = svg.append('g').attr('transform', `translate(${margin.left + 6},${H - 12})`);
  [['Graded assignment', colorMap.ga], ['ROE', colorMap.roe], ['Project', colorMap.project]]
    .forEach(([l, c], i) => {
      const g = leg.append('g').attr('transform', `translate(${i * 132},0)`);
      g.append('circle').attr('cx', 5).attr('cy', -4).attr('r', 4).attr('fill', c);
      g.append('text').attr('x', 14).attr('class', 'chart-label').text(l);
    });
  const g = leg.append('g').attr('transform', 'translate(400,0)');
  g.append('circle').attr('cx', 5).attr('cy', -4).attr('r', 4).attr('fill', 'none')
    .attr('stroke', resolveColorToken('--text-muted')).attr('stroke-width', 1.5);
  g.append('text').attr('x', 14).attr('class', 'chart-label').text('what the portal showed');
}

/* ======================================================= CHAPTER 03 ===== */

function renderEndpointChapter() {
  const marks = D.marks_from_endpoints;
  const total = D.endpoint_diffusion.reduce((s, r) => s + r.answers, 0);
  renderMetricCards('#endpoint-metrics', [
    { num: '514', lbl: 'Students who submitted one address', cls: 'bad' },
    { num: '46', lbl: 'Questions that address answered', cls: 'bad' },
    { num: '7 of 9', lbl: 'Graded assignments it reached', cls: 'roe' },
    { num: integerFormatter.format(total), lbl: 'Answers pointing at a shared endpoint', cls: 'accent' },
    { num: formatPercent(marks.pct), lbl: 'Of assignment marks awarded on one', cls: 'bad' },
    { num: '99.9%', lbl: 'Of GA8 shared-endpoint answers that scored', cls: 'bad' },
  ]);

  const loopback = (host) => host.startsWith('127.') || host.startsWith('localhost');
  renderBarRows('#endpoint-bars', D.endpoints.map(row => ({
    name: row.host,
    value: row.students,
    label: integerFormatter.format(row.students),
    color: loopback(row.host) ? 'var(--text-muted)' : 'var(--bad)',
    tipTitle: row.host,
    tipBody: `${integerFormatter.format(row.students)} distinct students<br>${row.questions} questions across ${row.components} component${row.components > 1 ? 's' : ''}${loopback(row.host) ? '<br><strong>Loopback address — unreachable by any grader</strong>' : ''}`,
  })), { wide: true, mono: true });

  renderAdoptionChart();

  renderTable('#diffusion-table', D.endpoint_diffusion, [
    { key: 'component', label: 'Component', cls: 'table-cell-mono', fmt: v => v.toUpperCase() },
    { key: 'students', label: 'Students', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'questions', label: 'Questions', cls: 'table-cell-mono' },
    { key: 'answers', label: 'Answers', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'pct_scored', label: '% that scored', cls: 'table-cell-bad', fmt: v => formatPercent(v) },
    { key: 'marks_awarded', label: 'Marks awarded', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'first_seen', label: 'First seen', cls: 'table-cell-muted' },
    { key: 'last_seen', label: 'Last seen', cls: 'table-cell-muted' },
  ], { sort: 'students' });

  renderTable('#identical-table', D.identical_answers, [
    { key: 'component', label: 'GA', cls: 'table-cell-mono', fmt: v => v.toUpperCase() },
    { key: 'question', label: 'Question', fmt: v => `<code>${escapeAttribute(v)}</code>` },
    { key: 'students', label: 'Students', cls: 'table-cell-bad', fmt: v => integerFormatter.format(v) },
    { key: 'answer_chars', label: 'Chars', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'sample', label: 'The answer, verbatim', fmt: v => `<code>${escapeAttribute(v)}</code>` },
  ], { sort: 'students' });
}

function renderAdoptionChart() {
  const el = $('#adoption-chart');
  const data = D.endpoint_adoption.map(d => ({ ...d, date: new Date(d.week) }));
  const W = el.offsetWidth || 480, H = 240;
  const margin = { top: 22, right: 22, bottom: 46, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleTime().domain(d3.extent(data, d => d.date)).range([margin.left, W - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.cumulative) * 1.08]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%d %b'))).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5)).select('.domain').remove();

  const color = resolveColorToken('--bad');
  svg.append('path').datum(data).attr('fill', color).attr('opacity', .12)
    .attr('d', d3.area().x(d => x(d.date)).y0(H - margin.bottom).y1(d => y(d.cumulative)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
    .attr('d', d3.line().x(d => x(d.date)).y(d => y(d.cumulative)).curve(d3.curveMonotoneX));
  const bandwidth = Math.max(4, (W - margin.left - margin.right) / data.length * 0.5);
  svg.selectAll('rect').data(data).join('rect')
    .attr('x', d => x(d.date) - bandwidth / 2).attr('y', d => y(d.new_students))
    .attr('width', bandwidth).attr('height', d => y(0) - y(d.new_students)).attr('rx', 2)
    .attr('fill', resolveColorToken('--accent')).attr('opacity', .75)
    .on('mousemove', (event, d) => showTooltip(event, `Week of ${d.week}`,
      `<strong>${integerFormatter.format(d.new_students)}</strong> students used one for the first time<br>${integerFormatter.format(d.cumulative)} cumulative`))
    .on('mouseleave', hideTooltip);
  const leg = svg.append('g').attr('transform', `translate(${margin.left + 6},${margin.top - 8})`);
  [['Cumulative students', color], ['New that week', resolveColorToken('--accent')]].forEach(([l, c], i) => {
    const g = leg.append('g').attr('transform', `translate(${i * 150},0)`);
    g.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('y', -8).attr('fill', c);
    g.append('text').attr('x', 13).attr('class', 'chart-label').text(l);
  });
}

/* ======================================================= CHAPTER 04 ===== */

function renderResistanceChart() {
  const el = $('#resistance-chart');
  const data = D.question_resistance;
  const W = el.offsetWidth || 700, H = 300;
  const margin = { top: 26, right: 22, bottom: 58, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x0 = d3.scaleBand().domain(data.map(d => d.component)).range([margin.left, W - margin.right]).padding(0.22);
  const x1 = d3.scaleBand().domain(['server', 'farmed']).range([0, x0.bandwidth()]).padding(0.08);
  const y = d3.scaleLinear().domain([0, 100]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x0).tickSize(0).tickFormat(d => d.toUpperCase())).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%')).select('.domain').remove();

  const pctServer = d => d.server_side / d.questions * 100;
  const groups = svg.selectAll('.grp').data(data).join('g').attr('transform', d => `translate(${x0(d.component)},0)`);
  [['server', '--text-muted', 'Server-side', pctServer], ['farmed', '--bad', 'Farmed', d => d.pct_farmed]]
    .forEach(([key, token, label, accessor]) => {
      groups.append('rect').attr('x', x1(key)).attr('y', d => y(accessor(d)))
        .attr('width', x1.bandwidth()).attr('height', d => y(0) - y(accessor(d))).attr('rx', 3)
        .attr('fill', resolveColorToken(token)).attr('opacity', .88)
        .on('mousemove', (event, d) => showTooltip(event, `${d.component.toUpperCase()} · ${label}`,
          `${d.questions} questions, ${d.server_side} server-side<br>Server-side: <strong>${formatPercent(pctServer(d))}</strong><br>Farmed: <strong>${formatPercent(d.pct_farmed)}</strong> (${d.farmed} questions)`))
        .on('mouseleave', hideTooltip);
    });
  groups.append('text').attr('class', 'chart-label')
    .attr('x', x1('farmed') + x1.bandwidth() / 2).attr('y', d => y(d.pct_farmed) - 5)
    .attr('text-anchor', 'middle').attr('fill', resolveColorToken('--bad'))
    .text(d => d.pct_farmed > 0 ? Math.round(d.pct_farmed) + '%' : '0');
  const leg = svg.append('g').attr('transform', `translate(${margin.left + 6},${H - 12})`);
  [['% of questions server-side', '--text-muted'], ['% of questions farmed', '--bad']].forEach(([l, t], i) => {
    const g = leg.append('g').attr('transform', `translate(${i * 190},0)`);
    g.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('y', -9).attr('fill', resolveColorToken(t));
    g.append('text').attr('x', 13).attr('class', 'chart-label').text(l);
  });
}

/* ======================================================= CHAPTER 05 ===== */

function renderMarksChapter() {
  renderBarRows('#p1-bars', D.p1_portal_vs_real.map(row => ({
    name: row.question.replace(/^q-/, ''),
    value: row.pct_shown_full,
    label: formatPercent(row.pct_shown_full),
    color: row.pct_shown_full > 85 ? 'var(--bad)' : 'var(--accent)',
    tipTitle: row.question,
    tipBody: `${integerFormatter.format(row.students)} students · ${row.marks_available} marks available<br>Shown full marks: <strong>${formatPercent(row.pct_shown_full)}</strong><br>Shown zero: ${formatPercent(row.pct_zero)}<br>Average portal marks: ${decimalFormatter.format(row.avg_portal_marks)}`,
  })), { mono: true });

  // Four bars on a fixed 0-100 scale: what the portal showed at submission (hollow) and
  // what the student finally got (solid), for each project. The pair is the point -- a
  // single "marks shown" bar per project reads as P1 having been the transparent one,
  // which is backwards.
  const projects = ['p1', 'p2'].map(k => D.component_scores.find(c => c.component === k));
  renderBarRows('#p1-vs-p2-bars', projects.flatMap(row => {
    const label = row.component === 'p1' ? 'Project 1' : 'Project 2';
    const disclosed = row.component === 'p2';
    const tipBody = `${integerFormatter.format(row.submitters)} submitters<br>`
      + `Portal at submission: <strong>${formatPercent(row.portal_avg)}</strong><br>`
      + `Finalised: <strong>${formatPercent(row.final_avg)}</strong><br>`
      + `Moved <strong>+${decimalFormatter.format(row.shift)}</strong> points after submission — `
      + (disclosed ? 'declared up front as 2.5 of 12.5 banked, the rest pending.'
                   : 'never announced, and per question it moved both ways.');
    return [
      { name: `${label} — portal showed`, value: row.portal_avg, label: formatPercent(row.portal_avg),
        color: disclosed ? 'var(--good)' : 'var(--bad)', hollow: true,
        tipTitle: `${label}: shown at submission`, tipBody },
      { name: `${label} — finalised`, value: row.final_avg, label: formatPercent(row.final_avg),
        color: disclosed ? 'var(--good)' : 'var(--bad)',
        tipTitle: `${label}: finalised mark`, tipBody },
    ];
  }), { max: 100 });
}

/* ======================================================= CHAPTER 06 ===== */

function renderJudgeChapter() {
  const q1 = D.p2_effort_vs_grade[0], q5 = D.p2_effort_vs_grade.at(-1);
  const top2 = D.p2_verdicts.filter(v => ['strong', 'good'].includes(v.verdict)).reduce((s, v) => s + v.pct, 0);
  const graded = D.p2_verdicts.reduce((s, v) => s + v.grades, 0);
  renderMetricCards('#judge-metrics', [
    { num: integerFormatter.format(D.p2_cohort.students), lbl: 'Students graded by the Project 2 judge', cls: 'accent' },
    { num: integerFormatter.format(graded), lbl: 'Question grades, each with cited evidence', cls: 'ga' },
    { num: '29,623', lbl: 'Rubric-dimension scores published', cls: 'good' },
    { num: formatPercent(top2), lbl: 'Of grades in the top two of six bands', cls: 'bad' },
    { num: decimalFormatter.format(q1.final_100), lbl: 'Least-effort quintile average, out of 100', cls: 'roe' },
    { num: 'r = 0.57', lbl: 'Correlation between length and the mark', cls: 'bad' },
  ]);

  renderJudgeEffortChart();
  renderJudgeScatter();



  const verdictColor = { strong: '--bad', good: '--roe', mixed: '--accent', weak: '--ga', poor: '--good', unsafe: '--text-muted' };
  renderBarRows('#verdict-bars', D.p2_verdicts.map(row => ({
    name: row.verdict,
    value: row.grades,
    label: formatPercent(row.pct),
    color: `var(${verdictColor[row.verdict] || '--text-muted'})`,
    tipTitle: `Verdict: ${row.verdict}`,
    tipBody: `<strong>${integerFormatter.format(row.grades)}</strong> question grades<br>${formatPercent(row.pct)} of all grades`,
  })));

  renderBarRows('#dimension-bars', D.p2_dimensions.map(row => ({
    name: row.dimension,
    value: row.avg_score,
    label: decimalFormatter.format(row.avg_score),
    color: row.avg_score < 3.2 ? 'var(--bad)' : row.avg_score > 3.5 ? 'var(--good)' : 'var(--accent)',
    tipTitle: row.dimension,
    tipBody: `Average score: <strong>${decimalFormatter.format(row.avg_score)} / 4</strong><br>Graded ${integerFormatter.format(row.graded)} times<br>Scored 0 or 1: ${formatPercent(row.pct_failing)}<br>Average citations per score: ${decimalFormatter.format(row.avg_citations)}`,
  })), { wide: true, max: 4 });
}

function renderJudgeEffortChart() {
  const el = $('#judge-effort-chart');
  const data = D.p2_effort_vs_grade;
  const W = el.offsetWidth || 480, H = 240;
  const margin = { top: 22, right: 22, bottom: 52, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand().domain(data.map(d => d.quintile)).range([margin.left, W - margin.right]).padding(0.24);
  const y = d3.scaleLinear().domain([0, 100]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0).tickFormat(d => `Q${d}`)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5)).select('.domain').remove();

  // Participation is a fixed 20 for everyone who answered, so stack it under the
  // analytical mark: the visible variation is entirely in the top segment.
  svg.selectAll('.part').data(data).join('rect').attr('class', 'part')
    .attr('x', d => x(d.quintile)).attr('y', d => y(d.participation_20))
    .attr('width', x.bandwidth()).attr('height', d => y(0) - y(d.participation_20)).attr('rx', 3)
    .attr('fill', resolveColorToken('--good')).attr('opacity', .8);
  svg.selectAll('.anal').data(data).join('rect').attr('class', 'anal')
    .attr('x', d => x(d.quintile)).attr('y', d => y(d.final_100))
    .attr('width', x.bandwidth()).attr('height', d => y(d.participation_20) - y(d.final_100)).attr('rx', 3)
    .attr('fill', resolveColorToken('--ga')).attr('opacity', .85)
    .on('mousemove', (event, d) => showTooltip(event, `Effort quintile ${d.quintile}`,
      `${integerFormatter.format(d.students)} students<br>Average ${integerFormatter.format(d.avg_chars)} characters written<br>Participation: <strong>${decimalFormatter.format(d.participation_20)} / 20</strong><br>Analytical: <strong>${decimalFormatter.format(d.analytical_80)} / 80</strong><br>Final: <strong>${decimalFormatter.format(d.final_100)} / 100</strong>`))
    .on('mouseleave', hideTooltip);
  svg.selectAll('.val').data(data).join('text').attr('class', 'chart-label')
    .attr('x', d => x(d.quintile) + x.bandwidth() / 2).attr('y', d => y(d.final_100) - 5)
    .attr('text-anchor', 'middle').text(d => decimalFormatter.format(d.final_100));
  const leg = svg.append('g').attr('transform', `translate(${margin.left + 4},${H - 12})`);
  [['Participation /20', '--good'], ['Analytical /80', '--ga']].forEach(([l, t], i) => {
    const g = leg.append('g').attr('transform', `translate(${i * 140},0)`);
    g.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('y', -9).attr('fill', resolveColorToken(t));
    g.append('text').attr('x', 13).attr('class', 'chart-label').text(l);
  });
}

function renderJudgeScatter() {
  const el = $('#judge-scatter');
  const data = D.p2_scatter;
  const W = el.offsetWidth || 700, H = 320;
  const margin = { top: 24, right: 26, bottom: 56, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.chars) * 1.03]).range([margin.left, W - margin.right]);
  const y = d3.scaleLinear().domain([0, 80]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${Math.round(d / 1000)}k`)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5)).select('.domain').remove();
  svg.append('text').attr('class', 'chart-label').attr('x', W / 2).attr('y', H - 4)
    .attr('text-anchor', 'middle').text('Characters written across the project');
  svg.append('text').attr('class', 'chart-label').attr('transform', 'rotate(-90)')
    .attr('x', -H / 2).attr('y', 14).attr('text-anchor', 'middle').text('Analytical mark / 80');

  svg.selectAll('circle').data(data).join('circle')
    .attr('cx', d => x(d.chars)).attr('cy', d => y(d.analytical)).attr('r', 3.2)
    .attr('fill', resolveColorToken('--ga')).attr('opacity', .5)
    .on('mousemove', (event, d) => showTooltip(event, 'One student',
      `${integerFormatter.format(d.chars)} characters written<br>Analytical: <strong>${decimalFormatter.format(d.analytical)} / 80</strong><br>Final: ${decimalFormatter.format(d.final)} / 100`))
    .on('mouseleave', hideTooltip);

  // Least-squares fit, to make the r = 0.57 relationship legible rather than asserted.
  const meanX = d3.mean(data, d => d.chars), meanY = d3.mean(data, d => d.analytical);
  const slope = d3.sum(data, d => (d.chars - meanX) * (d.analytical - meanY))
    / d3.sum(data, d => (d.chars - meanX) ** 2);
  const at = (cx) => meanY + slope * (cx - meanX);
  const [x0, x1] = x.domain();
  svg.append('line').attr('stroke', resolveColorToken('--accent')).attr('stroke-width', 2)
    .attr('stroke-dasharray', '6,4')
    .attr('x1', x(x0)).attr('y1', y(at(x0))).attr('x2', x(x1)).attr('y2', y(at(x1)));
  svg.append('text').attr('class', 'chart-label').attr('fill', resolveColorToken('--accent'))
    .attr('x', W - margin.right).attr('y', y(at(x1)) - 8).attr('text-anchor', 'end')
    .text('r = 0.57');
}

/* ======================================================= CHAPTER 07 ===== */

function renderInstructionsChapter() {
  renderBarRows('#drive-bars', D.drive_access.map(row => ({
    name: `${row.first_check} → ${row.after_followup}`,
    value: row.students,
    label: integerFormatter.format(row.students),
    color: row.after_followup.startsWith('recovered') ? 'var(--good)' : 'var(--bad)',
    tipTitle: row.first_check,
    tipBody: `${escapeAttribute(row.after_followup)}<br><strong>${integerFormatter.format(row.students)}</strong> students`,
  })), { wide: true });

  const folders = D.folder_names.filter(r => r.folder_name).slice(0, 5);
  renderBarRows('#folder-bars', folders.map(row => ({
    name: row.folder_name,
    value: row.students,
    label: integerFormatter.format(row.students),
    color: 'var(--accent)',
    tipTitle: row.folder_name,
    tipBody: `<strong>${integerFormatter.format(row.students)}</strong> students used this exact name<br>One of ${D.folder_name_count.distinct_names} distinct names, from ${integerFormatter.format(D.folder_name_count.students_who_shared)} students who shared a folder`,
  })), { mono: true });
}

/* ======================================================= CHAPTER 08 ===== */

function renderCalendarChapter() {
  const slips = D.calendar.filter(r => r.slip_days != null).sort((a, b) => b.slip_days - a.slip_days);
  renderBarRows('#slip-bars', slips.map(row => ({
    name: row.component.toUpperCase(),
    value: Math.max(row.slip_days, 0.15),
    label: `${row.slip_days}d`,
    color: row.slip_days >= 6 ? 'var(--bad)' : row.slip_days > 0 ? 'var(--accent)' : 'var(--text-muted)',
    tipTitle: row.title || row.component,
    tipBody: `Config open: ${row.config_open}<br>First real save: <strong>${row.first_real_save}</strong><br>Deadline: ${row.deadline || 'per-student'}<br>${row.n_commits} commits to the question set`,
  })));

  const rejections = D.rejections.filter(r => r.rejected > 0);
  renderBarRows('#rejection-bars', rejections.map(row => ({
    name: row.component.toUpperCase(),
    value: row.pct_rejected,
    label: formatPercent(row.pct_rejected),
    color: row.pct_rejected > 15 ? 'var(--bad)' : row.pct_rejected > 5 ? 'var(--accent)' : 'var(--text-muted)',
    tipTitle: row.component.toUpperCase(),
    tipBody: `<strong>${integerFormatter.format(row.rejected)}</strong> of ${integerFormatter.format(row.attempts)} saves refused<br>${formatPercent(row.pct_rejected)} of all attempts`,
  })));

  renderGa5Chart();

  renderTable('#calendar-table', D.calendar, [
    { key: 'component', label: 'Component', cls: 'table-cell-mono', fmt: v => v.toUpperCase() },
    { key: 'config_open', label: 'Config open', cls: 'table-cell-muted' },
    { key: 'first_real_save', label: 'First real save', cls: 'table-cell-mono' },
    { key: 'slip_days', label: 'Days late', cls: 'table-cell-bad', fmt: v => v == null ? '—' : `${v}d` },
    { key: 'deadline', label: 'Deadline', cls: 'table-cell-muted', fmt: v => v ?? 'per-student' },
    { key: 'n_commits', label: 'Commits', cls: 'table-cell-mono' },
    { key: 'students', label: 'Students', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'attempts', label: 'Attempts', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'rejected', label: 'Refused', cls: 'table-cell-bad', fmt: v => integerFormatter.format(v) },
  ], { sort: 'slip_days' });
}

function renderGa5Chart() {
  const el = $('#ga5-chart');
  const data = D.ga5_daily.map(d => ({ ...d, date: new Date(d.day) }));
  const W = el.offsetWidth || 700, H = 300;
  const margin = { top: 26, right: 26, bottom: 52, left: 54 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleTime().domain(d3.extent(data, d => d.date)).range([margin.left, W - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.attempts) * 1.1]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat(d3.timeFormat('%d %b'))).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5)).select('.domain').remove();

  // The original deadline, before the two extensions.
  const marker = new Date('2026-07-26');
  svg.append('line').attr('class', 'grid-line').attr('stroke-dasharray', '4,4')
    .attr('stroke', resolveColorToken('--accent'))
    .attr('x1', x(marker)).attr('x2', x(marker)).attr('y1', margin.top).attr('y2', H - margin.bottom);
  svg.append('text').attr('class', 'chart-label').attr('fill', resolveColorToken('--accent'))
    .attr('x', x(marker) + 5).attr('y', margin.top + 2).text('original deadline');

  [['attempts', '--ga', 'Save attempts'], ['rejected', '--bad', 'Refused']].forEach(([key, token, label]) => {
    const color = resolveColorToken(token);
    svg.append('path').datum(data).attr('fill', color).attr('opacity', .1)
      .attr('d', d3.area().x(d => x(d.date)).y0(H - margin.bottom).y1(d => y(d[key])).curve(d3.curveMonotoneX));
    svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
      .attr('d', d3.line().x(d => x(d.date)).y(d => y(d[key])).curve(d3.curveMonotoneX));
    svg.selectAll(`.p-${key}`).data(data).join('circle').attr('class', `p-${key}`)
      .attr('cx', d => x(d.date)).attr('cy', d => y(d[key])).attr('r', 3).attr('fill', color)
      .on('mousemove', (event, d) => showTooltip(event, d.day,
        `<strong>${integerFormatter.format(d.attempts)}</strong> save attempts<br><strong>${integerFormatter.format(d.rejected)}</strong> refused (${formatPercent(d.rejected / d.attempts * 100)})`))
      .on('mouseleave', hideTooltip);
    svg.append('text').attr('class', 'chart-label').attr('fill', color)
      .attr('x', W - margin.right).attr('text-anchor', 'end')
      .attr('y', key === 'attempts' ? margin.top + 2 : margin.top + 16)
      .text(label);
  });
}

/* ======================================================= CHAPTER 09 ===== */

// Seven kinds, seven separable hues. `fix` and `exam-info` take the neutrals because
// `deadline` already owns red and putting a second red beside it made the two
// unreadable at tick size.
function renderTimingChapter() {
  const gaLast6 = D.timing_deadline.find(r => r.component === 'p1');
  const night = d3.mean(D.timing_deadline, r => r.pct_night);
  const early = D.deadline_impact[0], last6 = D.deadline_impact.find(r => r.bucket === 'Final 6 hours');
  renderMetricCards('#timing-metrics', [
    { num: formatPercent(gaLast6.pct_last_24h), lbl: 'Of Project 1 saves in the final 24 hours', cls: 'bad' },
    { num: formatPercent(night), lbl: 'Average share of saves between 22:00 and 06:00', cls: 'accent' },
    { num: formatPercent(early.ga_score), lbl: 'GA score when the final save was 3+ days early', cls: 'good' },
    { num: formatPercent(last6.ga_score), lbl: 'GA score when it landed in the final 6 hours', cls: 'roe' },
    { num: integerFormatter.format(D.deadline_impact.reduce((s, r) => s + r.saves, 0)), lbl: 'Final saves placed against a deadline', cls: '' },
    { num: '68', lbl: 'Final saves that landed after the deadline', cls: 'bad' },
  ]);

  renderTimingImpact();

  renderBarRows('#deadline-bars', D.timing_deadline.map(row => ({
    name: row.component.toUpperCase(),
    value: row.pct_last_24h,
    label: formatPercent(row.pct_last_24h),
    color: row.pct_last_24h > 40 ? 'var(--bad)' : 'var(--project)',
    tipTitle: row.component.toUpperCase(),
    tipBody: `<strong>${formatPercent(row.pct_last_24h)}</strong> of saves in the final 24 hours<br>${formatPercent(row.pct_night)} between 22:00 and 06:00 IST`,
  })));

  $('#timing-notes').innerHTML = [
    { num: formatPercent(early.ga_score - last6.ga_score), txt: 'Points separating graded-assignment scores for students who finished three days early and those who finished in the final six hours.' },
    { num: formatPercent(last6.project_share), txt: 'Of project final saves landed in the last six hours. Projects invert the GA pattern, because their portal score was participation marks — which reward submitting at all.' },
  ].map(note => `
    <div class="timing-note">
      <div class="num">${note.num}</div>
      <div class="txt">${note.txt}</div>
    </div>`).join('');

  const rhythm = (rows) => ({
    hours: HOURS_IN_DAY.map(h => rows.find(r => r.series === 'hours' && r.idx === h)?.n ?? 0),
    days: DAY_NAMES.map((_, d) => rows.find(r => r.series === 'days' && r.idx === d)?.n ?? 0),
  });
  renderRhythm('#submission-rhythm', {
    name: 'Accepted saves by hour and day', unit: 'saves', color: '--ga', ...rhythm(D.submission_rhythm),
  });
  renderRhythm('#forum-rhythm', {
    name: 'Forum posts by hour and day', unit: 'posts', color: '--accent', ...rhythm(D.forum_rhythm),
  });

  const dense = (rows) => Array.from({ length: 168 }, (_, i) => rows.find(r => r.idx === i)?.n ?? 0);
  renderHeatmap('#submission-heatmap', {
    name: 'Accepted saves', unit: 'saves', color: '--ga',
    values: dense(D.submission_heatmap), peakLabel: 'ROE spike',
    peakNote: "ROE's 45-minute exam window — the single busiest cell of the term",
  });
  renderHeatmap('#forum-heatmap', {
    name: 'Forum posts', unit: 'posts', color: '--accent',
    values: dense(D.forum_heatmap), peakLabel: 'Busiest cell',
    peakNote: 'Peak forum window',
  });
}

function renderTimingImpact() {
  $('#timing-impact').innerHTML = `
    <div class="timing-impact-row">
      <div class="timing-impact-head">Final save</div>
      <div class="timing-impact-head">GA share</div>
      <div class="timing-impact-head align-right">Score</div>
      <div class="timing-impact-head">Project share</div>
      <div class="timing-impact-head align-right">Score</div>
    </div>
    ${D.deadline_impact.map(row => `
      <div class="timing-impact-row">
        <div class="timing-bucket">${row.bucket}</div>
        <div class="timing-track"
             data-tip-title="${escapeAttribute(row.bucket)} · graded assignments"
             data-tip-body="${escapeAttribute(`${formatPercent(row.ga_share)} of GA final saves<br>Average score: <strong>${formatPercent(row.ga_score)}</strong>`)}">
          <div class="timing-fill is-ga" style="width:${row.ga_share}%"></div>
        </div>
        <div class="timing-num">${formatPercent(row.ga_score)}</div>
        <div class="timing-track"
             data-tip-title="${escapeAttribute(row.bucket)} · projects"
             data-tip-body="${escapeAttribute(`${formatPercent(row.project_share)} of project final saves<br>Average score: <strong>${formatPercent(row.project_score)}</strong>`)}">
          <div class="timing-fill is-project" style="width:${row.project_share}%"></div>
        </div>
        <div class="timing-num">${formatPercent(row.project_score)}</div>
      </div>`).join('')}`;
}

function renderRhythm(container, data) {
  const totalHours = data.hours.reduce((sum, value) => sum + value, 0);
  const totalDays = data.days.reduce((sum, value) => sum + value, 0);
  const maxHour = Math.max(...data.hours);
  const maxDay = Math.max(...data.days);
  $(container).innerHTML = `
    <div class="rhythm-card">
      <div class="rhythm-title">
        <div class="rhythm-name">${data.name}</div>
        <div class="rhythm-total">${integerFormatter.format(totalHours)} events · IST</div>
      </div>
      <div class="hour-bars">
        ${data.hours.map((count, hour) => `
          <div class="hour-bar"
            data-tip-title="${String(hour).padStart(2, '0')}:00 IST"
            data-tip-body="${escapeAttribute(`${integerFormatter.format(count)} ${data.unit}<br>${formatPercent(count * 100 / totalHours)} of all ${data.unit}`)}"
            aria-label="${String(hour).padStart(2, '0')}:00 IST, ${integerFormatter.format(count)} ${data.unit}"
            style="height:${Math.max(3, count / maxHour * 100)}%;background:${resolveColorToken(data.color)}"
          ></div>`).join('')}
      </div>
      <div class="hour-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>23:00</span></div>
      <div class="day-strip">
        ${data.days.map((count, day) => `
          <div class="day-cell"
            data-tip-title="${DAY_NAMES[day]}"
            data-tip-body="${escapeAttribute(`${integerFormatter.format(count)} ${data.unit}<br>${formatPercent(count * 100 / totalDays)} of all ${data.unit}`)}"
            aria-label="${DAY_NAMES[day]}, ${integerFormatter.format(count)} ${data.unit}"
            style="background:color-mix(in srgb, ${resolveColorToken(data.color)} ${Math.max(8, count / maxDay * 34)}%, rgba(255,255,255,.025))"
          >
            <div class="day">${DAY_NAMES[day]}</div>
            <div class="val">${decimalFormatter.format(count * 100 / totalDays)}%</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderHeatmap(container, data) {
  const values = data.values;
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = values.reduce((best, count, index) => count > best.count ? { count, index } : best, { count: -1, index: 0 });
  const peakDay = Math.floor(peak.index / 24);
  const peakHour = peak.index % 24;
  const weekendTotal = values.slice(5 * 24).reduce((sum, value) => sum + value, 0);
  const color = resolveColorToken(data.color);
  const hourLabel = (hour) => String(hour).padStart(2, '0');
  const heatStyle = (count) => {
    const intensity = Math.max(6, Math.sqrt(count / peak.count) * 86).toFixed(1);
    return `background:color-mix(in srgb, ${color} ${intensity}%, rgba(255,255,255,.035))`;
  };
  $(container).innerHTML = `
    <div class="heatmap-meta">
      <div class="heatmap-pill">${data.peakLabel || 'Peak'} <strong>${DAY_NAMES[peakDay]} ${hourLabel(peakHour)}:00</strong> · ${integerFormatter.format(peak.count)}</div>
      <div class="heatmap-pill">Weekend share <strong>${formatPercent(weekendTotal * 100 / total)}</strong></div>
      <div class="heatmap-pill">Total <strong>${integerFormatter.format(total)}</strong> ${data.unit}</div>
    </div>
    <div class="heatmap" role="img" aria-label="${data.name} by day and hour in IST">
      <div class="heatmap-axis">
        <div></div>
        <div class="heatmap-hour-cells">
          ${HOURS_IN_DAY.map(hour => `<div class="heatmap-hour">${[0, 6, 12, 18, 23].includes(hour) ? hourLabel(hour) : ''}</div>`).join('')}
        </div>
      </div>
      ${DAY_NAMES.map((dayName, day) => `
        <div class="heatmap-row">
          <div class="heatmap-day-label">${dayName}</div>
          <div class="heatmap-cells">
            ${HOURS_IN_DAY.map(hour => {
    const index = day * 24 + hour;
    const count = values[index];
    const isPeak = index === peak.index ? ' peak' : '';
    const tipTitle = `${dayName} ${hourLabel(hour)}:00 IST`;
    const peakNote = data.peakNote ? `<br><strong>${data.peakNote}</strong>` : '';
    const tipBody = `${integerFormatter.format(count)} ${data.unit}<br>${formatPercent(count * 100 / total)} of all ${data.unit}${isPeak ? peakNote : ''}`;
    return `<div class="heat-cell${isPeak}" data-tip-title="${escapeAttribute(tipTitle)}" data-tip-body="${escapeAttribute(tipBody)}" aria-label="${escapeAttribute(`${tipTitle}, ${integerFormatter.format(count)} ${data.unit}`)}" style="${heatStyle(count)}"></div>`;
  }).join('')}
          </div>
        </div>`).join('')}
      <div class="heatmap-footer">
        <div class="heatmap-legend">
          <span>Low</span>
          ${[10, 28, 46, 64, 82].map(intensity => `<span class="heatmap-swatch" style="background:color-mix(in srgb, ${color} ${intensity}%, rgba(255,255,255,.035))"></span>`).join('')}
          <span>High</span>
        </div>
        <div>IST · day x hour</div>
      </div>
    </div>`;
}

/* ======================================================= CHAPTER 10 ===== */

function renderForumChapter() {
  const monthly = D.forum_monthly;
  const totals = monthly.reduce((a, m) => ({
    topics: a.topics + m.topics, posts: a.posts + m.posts,
    views: a.views + m.views, never: a.never + m.never_answered, resolved: a.resolved + m.resolved,
  }), { topics: 0, posts: 0, views: 0, never: 0, resolved: 0 });
  const disputes = D.forum_intent.find(r => r.intent === 'marks dispute');
  const help = D.forum_intent.find(r => r.intent === 'technical help with the task');
  renderMetricCards('#forum-metrics', [
    { num: integerFormatter.format(totals.topics), lbl: 'Threads created during the term', cls: 'accent' },
    { num: integerFormatter.format(D.headline.forum_posts), lbl: 'Posts in those threads', cls: '' },
    { num: formatPercent(D.forum_family[0].pct), lbl: 'Threads that were administrative friction', cls: 'bad' },
    { num: integerFormatter.format(disputes.topics), lbl: 'Marks disputes', cls: 'roe' },
    { num: integerFormatter.format(help.topics), lbl: 'Threads asking for help with the task', cls: 'good' },
    { num: `${d3.median(monthly.filter(m => m.topics > 10), m => m.med_hours_to_reply)} hrs`, lbl: 'Median time to a first reply', cls: 'good' },
  ]);

  const familyColor = {
    'administrative friction': 'var(--bad)',
    'learning the material': 'var(--good)',
    'complaint about the course': 'var(--accent)',
  };
  renderBarRows('#family-bars', D.forum_family.map(row => ({
    name: row.family,
    value: row.pct,
    label: formatPercent(row.pct),
    color: familyColor[row.family] || 'var(--text-muted)',
    tipTitle: row.family,
    tipBody: `<strong>${integerFormatter.format(row.topics)}</strong> threads (${formatPercent(row.pct)})<br>${integerFormatter.format(row.posts)} posts · ${integerFormatter.format(row.views)} views`,
  })), { wide: true });

  renderBarRows('#intent-bars', D.forum_intent.map(row => ({
    name: row.intent,
    value: row.topics,
    label: integerFormatter.format(row.topics),
    color: row.intent === 'technical help with the task' ? 'var(--good)'
      : row.intent === 'peer resource sharing' ? 'var(--ga)' : 'var(--bad)',
    tipTitle: row.intent,
    tipBody: `<strong>${integerFormatter.format(row.topics)}</strong> threads (${formatPercent(row.pct)})<br>${integerFormatter.format(row.posts)} posts · ${integerFormatter.format(row.views)} views<br>${row.resolved} marked resolved<br>Label confidence (margin): ${decimalFormatter.format(row.avg_margin * 1000) / 1000}`,
  })), { wide: true });

  renderFrictionChart();
  renderLatencyChart();

  renderTable('#topics-table', D.forum_top_topics, [
    { key: 'views', label: 'Views', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'posts_count', label: 'Posts', cls: 'table-cell-mono' },
    { key: 'created', label: 'Created', cls: 'table-cell-muted' },
    { key: 'intent', label: 'Intent', cls: 'table-cell-muted' },
    {
      key: 'has_accepted_answer', label: 'Resolved',
      cls: 'table-cell-mono', fmt: v => v ? '<span class="table-cell-good">yes</span>' : '<span class="table-cell-muted">no</span>',
    },
    {
      key: 'title', label: 'Thread',
      fmt: (v, row) => `<a href="${escapeAttribute(row.url)}" target="_blank" rel="noopener">${escapeAttribute(v)}</a>`,
    },
  ], { sort: 'views' });
}

function renderFrictionChart() {
  const el = $('#friction-chart');
  const data = D.forum_friction_trend.filter(d => d.topics > 10);
  const W = el.offsetWidth || 480, H = 240;
  const margin = { top: 22, right: 22, bottom: 46, left: 50 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scalePoint().domain(data.map(d => d.month)).range([margin.left, W - margin.right]).padding(0.5);
  const y = d3.scaleLinear().domain([0, 100]).range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%')).select('.domain').remove();
  const color = resolveColorToken('--bad');
  svg.append('path').datum(data).attr('fill', color).attr('opacity', .12)
    .attr('d', d3.area().x(d => x(d.month)).y0(H - margin.bottom).y1(d => y(d.pct)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.4)
    .attr('d', d3.line().x(d => x(d.month)).y(d => y(d.pct)).curve(d3.curveMonotoneX));
  svg.selectAll('circle').data(data).join('circle')
    .attr('cx', d => x(d.month)).attr('cy', d => y(d.pct)).attr('r', 4).attr('fill', color)
    .on('mousemove', (event, d) => showTooltip(event, d.month,
      `<strong>${formatPercent(d.pct)}</strong> of threads were marks disputes or portal bugs<br>${d.marks_and_bugs} of ${d.topics} threads`))
    .on('mouseleave', hideTooltip);
  svg.selectAll('.val').data(data).join('text').attr('class', 'chart-label')
    .attr('x', d => x(d.month)).attr('y', d => y(d.pct) - 9).attr('text-anchor', 'middle')
    .text(d => formatPercent(d.pct));
}

function renderLatencyChart() {
  const el = $('#latency-chart');
  const data = D.forum_monthly.filter(d => d.topics > 10);
  const W = el.offsetWidth || 480, H = 240;
  const margin = { top: 22, right: 44, bottom: 46, left: 50 };
  const svg = d3.select(el).html('').append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand().domain(data.map(d => d.month)).range([margin.left, W - margin.right]).padding(0.3);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.med_hours_to_reply, d.never_answered)) * 1.3])
    .range([H - margin.bottom, margin.top]);
  svg.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'grid-line')
    .attr('x1', margin.left).attr('x2', W - margin.right).attr('y1', d => y(d)).attr('y2', d => y(d));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5)).select('.domain').remove();
  const x1 = d3.scaleBand().domain(['hrs', 'never']).range([0, x.bandwidth()]).padding(0.1);
  const groups = svg.selectAll('.grp').data(data).join('g').attr('transform', d => `translate(${x(d.month)},0)`);
  [['hrs', 'med_hours_to_reply', '--good', 'Median hours to first reply'],
    ['never', 'never_answered', '--bad', 'Threads never answered']].forEach(([slot, key, token, label]) => {
    groups.append('rect').attr('x', x1(slot)).attr('y', d => y(d[key]))
      .attr('width', x1.bandwidth()).attr('height', d => y(0) - y(d[key])).attr('rx', 3)
      .attr('fill', resolveColorToken(token)).attr('opacity', .88)
      .on('mousemove', (event, d) => showTooltip(event, `${d.month} · ${label}`,
        `${integerFormatter.format(d.topics)} threads<br>Median first reply: <strong>${d.med_hours_to_reply} hrs</strong><br>Never answered: <strong>${d.never_answered}</strong><br>${d.resolved} marked resolved`))
      .on('mouseleave', hideTooltip);
  });
  const leg = svg.append('g').attr('transform', `translate(${margin.left + 4},${margin.top - 8})`);
  [['Median hrs to reply', '--good'], ['Never answered', '--bad']].forEach(([l, t], i) => {
    const g = leg.append('g').attr('transform', `translate(${i * 150},0)`);
    g.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('y', -8).attr('fill', resolveColorToken(t));
    g.append('text').attr('x', 13).attr('class', 'chart-label').text(l);
  });
}

/* ======================================================= CHAPTER 11 ===== */

const ROLE_LABEL = {
  professor: 'Professor', instructor: 'Instructor', ta: 'TA', 'ex-ta': 'Ex-TA', la: 'LA',
};

/** One line of plain-language read per person, derived from their own numbers.
 *
 * Deliberately rule-based rather than hand-written: the same numbers always produce the
 * same sentence, so nobody is characterised beyond what their row says.
 */
function shortRead(row, share) {
  if (row.posts === 0) return 'No posts in the term\'s threads.';
  const parts = [];
  if (share >= 15) parts.push(`carried ${formatPercent(share)} of all forum posts`);
  else if (share >= 5) parts.push(`a steady share of the load at ${formatPercent(share)} of posts`);
  else parts.push(`a light footprint at ${formatPercent(share)} of posts`);
  if (row.accepted >= 20) parts.push(`and closed ${row.accepted} threads as the accepted answer`);
  else if (row.accepted > 0) parts.push(`closing ${row.accepted} threads`);
  const wait = row.median_first_reply_min;
  if (wait != null && wait < 360) parts.push(`typically first in the room within ${formatMinutes(wait)}`);
  else if (wait != null && wait > 1440) parts.push(`but typically arriving ${formatMinutes(wait)} after the question`);
  if (row.after_hours_pct >= 20) parts.push(`${formatPercent(row.after_hours_pct)} of it after 22:00`);
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';
}

function renderTeamChapter() {
  const team = D.team_forum;
  const split = D.responders;
  const teamRow = split.find(r => r.who === 'course team') || { posts: 0, pct_posts: 0, accepted: 0 };
  const totalPosts = split.reduce((sum, r) => sum + r.posts, 0);
  const answered = D.coverage.reduce((s, r) => s + r.answered, 0);
  const byTeam = D.coverage.reduce((s, r) => s + r.answered_by_team, 0);
  const topics = D.coverage.reduce((s, r) => s + r.topics, 0);
  const active = team.filter(t => t.posts > 0);
  // Everyone who answered as course team, including the two ex-TAs. Learning
  // Assistants worked on a separate deployment and get their own panel.
  const bench = team.filter(t => t.role !== 'la');

  const allAccepted = split.reduce((sum, r) => sum + r.accepted, 0);
  renderMetricCards('#team-metrics', [
    { num: formatPercent(teamRow.pct_posts), lbl: 'Of all forum posts came from the course team', cls: 'roe' },
    { num: formatPercent(teamRow.accepted / allAccepted * 100), lbl: 'Of thread closures came from the team', cls: 'good' },
    { num: formatPercent(d3.sum(bench.slice(0, 2), t => t.posts) / teamRow.posts * 100),
      lbl: 'Of team posts from the two heaviest TAs', cls: 'accent' },
    { num: formatPercent(byTeam / topics * 100), lbl: 'Threads the team replied to at some point', cls: 'ga' },
    { num: formatMinutes(D.forum_response.median_team_min), lbl: 'Median wait for the first team reply', cls: 'bad' },
    { num: integerFormatter.format(D.unanswered.length),
      lbl: 'Threads still with no reply from anyone', cls: 'bad' },
  ]);

  // Month-by-month coverage.
  $('#coverage-rows').innerHTML = D.coverage.filter(r => r.topics > 10).map(row => `
    <div class="team-term-row">
      <div>
        <div class="team-row-label">${row.month}</div>
        <div class="team-row-meta">${integerFormatter.format(row.topics)} threads · ${row.answered} answered</div>
      </div>
      <div class="team-bar"
           data-tip-title="${row.month}"
           data-tip-body="${escapeAttribute(`${integerFormatter.format(row.topics)} threads created<br>${row.answered} received a reply from anyone<br>${row.answered_by_team} got a first reply from the course team<br>Median first reply, anyone: ${formatMinutes(row.median_first_reply_min)}<br>Median first reply, team: ${formatMinutes(row.median_team_reply_min)}<br>${row.resolved} marked resolved`)}">
        <div class="team-fill" style="width:${row.team_coverage_pct}%"></div>
      </div>
      <div class="team-row-value">${formatPercent(row.team_coverage_pct)}<span>${formatMinutes(row.median_team_reply_min)} median</span></div>
    </div>`).join('');

  // Who actually answered: team against everyone else.
  const maxPosts = Math.max(...split.map(r => r.posts)) || 1;
  $('#responder-rows').innerHTML = split.map(row => `
    <div class="team-kind-row">
      <div>
        <div class="team-row-label">${row.who}</div>
        <div class="team-row-meta">${integerFormatter.format(row.people)} people · ${row.accepted} closures</div>
      </div>
      <div class="team-bar"
           data-tip-title="${escapeAttribute(row.who)}"
           data-tip-body="${escapeAttribute(`${integerFormatter.format(row.posts)} posts (${formatPercent(row.pct_posts)})<br>${integerFormatter.format(row.people)} distinct accounts<br>${row.accepted} thread closures`)}">
        <div class="team-fill ${row.who === 'course team' ? '' : 'is-mixed'}" style="width:${row.posts / maxPosts * 100}%"></div>
      </div>
      <div class="team-row-value">${formatPercent(row.pct_posts)}<span>of all posts</span></div>
    </div>`).join('');

  // Per-person cards, ordered by posts, everyone on the roster included.
  const months = {};
  D.team_forum_months.forEach(r => ((months[r.discourse] ??= []).push(r)));
  // The instructors panel quotes a number a query already holds; bind it so a data
  // change moves the copy rather than leaving it stale.
  const instructorPosts = D.instructor_presence.reduce((n, r) => n + r.posts, 0);
  const instructorTile = $('#instructor-posts');
  if (instructorTile) instructorTile.textContent = `${instructorPosts}`;

  $('#responder-cards').innerHTML = bench.map(row => {
    const share = row.posts / totalPosts * 100;
    const alumni = row.role === 'ex-ta';
    const chips = (months[row.discourse] || [])
      .map(m => `<span class="term-chip">${m.month} · ${m.posts}</span>`).join('');
    return `
      <div class="team-member-card ${row.posts >= 100 ? 'featured' : ''} ${row.posts === 0 ? 'is-silent' : ''}"
           data-tip-title="${escapeAttribute(row.name)}"
           data-tip-body="${escapeAttribute(`${ROLE_LABEL[row.role] || row.role}${alumni ? ` · appointed ${row.appointed_term}` : ''}<br>${integerFormatter.format(row.posts)} posts across ${row.topics} threads<br>${row.first_team_replies} threads where they were the first team voice · ${row.accepted} closed<br>${row.median_first_reply_min == null ? 'No replies to time' : `Median wait ${formatMinutes(row.median_first_reply_min)} from the question being asked`}`)}">
        <div class="team-member-top">
          <div>
            <div class="team-member-name">${row.name}</div>
            <div class="team-member-user">
              <a href="https://discourse.onlinedegree.iitm.ac.in/u/${encodeURIComponent(row.discourse)}"
                 target="_blank" rel="noopener">@${escapeAttribute(row.discourse)}</a>
            </div>
          </div>
          <div class="role-badge ${alumni ? 'is-unconfirmed' : ''}">${ROLE_LABEL[row.role] || row.role}${alumni ? ` · ${row.appointed_term}` : ''}</div>
        </div>
        <div class="team-member-num">${integerFormatter.format(row.posts)}</div>
        <div class="team-member-label">posts · ${formatPercent(share)} of the forum</div>
        <div class="team-mini-grid">
          <div class="team-mini"><div class="val">${row.first_team_replies}</div><div class="lbl">threads led</div></div>
          <div class="team-mini"><div class="val">${row.accepted}</div><div class="lbl">threads closed</div></div>
          <div class="team-mini"><div class="val">${formatMinutes(row.median_first_reply_min)}</div><div class="lbl">median wait, threads led</div></div>
          <div class="team-mini"><div class="val">${row.posts ? formatPercent(row.after_hours_pct) : '—'}</div><div class="lbl">posted after 22:00</div></div>
        </div>
        ${chips ? `<div class="term-chips">${chips}</div>` : ''}
        <div class="team-performance-note">
          <strong>Short read</strong><br>${shortRead(row, share)}
          ${alumni ? ` Ex-TA, appointed ${row.appointed_term} — alumni help, not assigned load.` : ''}
        </div>
      </div>`;
  }).join('');
}

/* ==================================================== CONCLUSION ======== */

// Ranked by how much of the term's damage each cause accounts for. Evidence is quoted
// from the queries above; the action is the change that evidence supports.
const RECOMMENDATIONS = [
  {
    owner: 'Question design', priority: 100,
    title: 'No graded answer may be a pointer',
    evidence: 'A URL, a Drive link or a hosted repo is free to copy and <strong>identical for everyone holding it</strong>. This single property produced the 514-student endpoint, the 17.6% of assignment marks awarded on shared URLs, and the 41-point inversion between assignments and the exam. Server-side questions amplified it: GA8 was 100% server-side and 80% farmed.',
    action: 'Seed every graded question from the student\'s own identity so the expected answer differs per student. Add an injected change on two locked checkpoints. GA6 is the existing proof — 10% farmed, because its answers could not be pointers.',
  },
  {
    owner: 'Portal', priority: 92,
    title: 'Show only marks that are final',
    evidence: '98.9% of students were told they had scored 12.5 out of 12.5 on Project 1 Question 1, then offline evaluation took it back. That produced <strong>127 marks-dispute threads</strong> — the largest single category of forum traffic in the term — and destroyed trust in offline evaluation generally.',
    action: 'Adopt Project 2\'s split everywhere: bank the participation share at submission, show the rest as pending with the amount at stake and the date it lands. P2\'s portal score was 19.9% — exactly the participation share — and the disputes did not follow.',
  },
  {
    owner: 'Portal', priority: 84,
    title: 'Machine-check every requirement at submission',
    evidence: '<strong>348 distinct folder names</strong> from 600 students against one stated convention, and 68 students who never successfully shared their Drive folder and never recovered. Every one of these was checkable at submission time; the check ran by hand, weeks later, after the marks were already contested.',
    action: 'Call the Drive API, confirm grader access, check the name pattern, confirm required files, reject loopback endpoints — and refuse the save with a reason. If a requirement is not machine-checkable, it is not graded.',
  },
  {
    owner: 'Course team', priority: 78,
    title: 'Freeze the calendar and keep a content buffer',
    evidence: 'GA1 shipped <strong>28 days</strong> after its config date. Week 8 teaching content landed eight days <em>after</em> GA8 was released. GA3 and GA5 took ten commits each after their nominal open date, and between them refused 3,116 saves. Students could not tell their own errors from the course\'s.',
    action: 'No assessment releases unless its teaching content shipped a week earlier. Void broken questions instead of patching them mid-flight. One deadline a week, never two components live at once.',
  },
  {
    owner: 'Evaluation', priority: 70,
    title: 'Publish the rubric with the question',
    evidence: 'For Project 1 and ROE, no rubrics, judge prompts or per-question offline scores survive — the loudest grievance of the term <strong>cannot even be audited</strong>. Project 2\'s grader did the opposite: published rubric, per-dimension scores, citations from the student\'s own text, and a lookup code.',
    action: 'Make P2\'s grader the floor for every offline evaluation. Then fix its two real faults: 88.5% of grades landed in the top two of six bands, and length correlates with the mark at r = 0.57. Anchor submissions per band, and cap or normalise length.',
  },
  {
    owner: 'Curriculum', priority: 64,
    title: 'Grade what students ruled out, not just what they concluded',
    evidence: 'Across 29,623 rubric-dimension scores, the weakest were <strong>causal reasoning (3.10/4)</strong>, investigative reasoning (3.11) and calibration against alternatives (3.12). The strongest was conclusion fit (3.71). Students reach the right answer and cannot show why they believe it.',
    action: 'Make "here is what I ruled out and how" a required, separately-marked deliverable. It is the gap an agent does not close — and, conveniently, the hardest thing to farm from a shared endpoint.',
  },
  {
    owner: 'Course team', priority: 56,
    title: 'Put visible authority in the forum',
    evidence: 'The two instructors posted <strong>twice between them</strong> across the term, and appeared in <strong>one</strong> of the 127 marks disputes. Two TAs carried 62% of the team\'s forum load. The <code>Course TA</code> badge exists but is not maintained — four different label strings are in use, a serving instructor carries none, and one ex-TA still carries one. Response speed was never the problem: a 2-hour median first reply, every month.',
    action: 'Name one owner for marks disputes with a stated turnaround, and give them the standing to close an appeal. Normalise the badge to one string and revoke it when a term ends. Instructors post a weekly note — presence, not answers. A forum of 127 disputes with nobody who can end one escalates by default.',
  },
  {
    owner: 'Course team', priority: 48,
    title: 'Open the feedback loop, or delete it',
    evidence: '<code>week1-feedback</code>, <code>week2-feedback</code>, <code>ga0-sp</code> and <code>ga1-partb</code> were all deployed with open dates and received <strong>zero submissions, ever</strong>. The weekly feedback loop did not fail — it never opened, so the forum became the student-voice channel by default.',
    action: 'Ship the weekly form — three questions, thirty seconds, published results — or remove it and stop counting it as a plan. Same decision for the Learning Assistant programme: it ran on a separate <code>exam-dev</code> deployment and left no reviewable record, so nobody can say what it found.',
  },
];

let activeRecommendationOwner = 'all';
function renderRecommendations() {
  const owners = ['all', ...new Set(RECOMMENDATIONS.map(r => r.owner))];
  $('#rec-filter').innerHTML = owners.map(o =>
    `<button class="chip ${activeRecommendationOwner === o ? 'active' : ''}" type="button" data-o="${escapeAttribute(o)}">${o === 'all' ? 'All owners' : o}</button>`).join('');
  $$('#rec-filter .chip').forEach(b => b.addEventListener('click', () => {
    activeRecommendationOwner = b.dataset.o;
    renderRecommendations();
  }));
  const recs = activeRecommendationOwner === 'all'
    ? RECOMMENDATIONS
    : RECOMMENDATIONS.filter(r => r.owner === activeRecommendationOwner);
  $('#rec-grid').innerHTML = recs.map(r => `
    <div class="rec-card">
      <div class="rec-owner">${r.owner} · priority ${r.priority}</div>
      <div class="rec-title">${r.title}</div>
      <div class="priority-bar"><div class="priority-fill" style="width:${r.priority}%"></div></div>
      <div class="rec-evidence"><strong>Evidence:</strong> ${r.evidence}</div>
      <div class="rec-action">↗ ${r.action}</div>
    </div>`).join('');
}

const NOT_CAUSES = [
  ['The open policy', 'Nothing in this review required a rule to be broken. The abstainers and the heaviest users faced identical rules; only the questions differed.'],
  ['Slow forum support', 'Median first reply of 2 to 3 hours, every month, and 94% of threads answered. Latency was never the issue.'],
  ['Student disengagement', '632 students submitted GA8 — in twenty minutes each. They were fully engaged with the marks. The marks just did not require the course.'],
  ['The LLM judge', 'Project 2\'s judge discriminated (r = 0.57 with effort), published its rubric and cited student text. Its faults are compression and verbosity bias, not opacity.'],
  ['ROE being too hard', 'ROE drew 787 students, averaged 54.6%, and produced the only usable score spread in the term. It is the one instrument that worked.'],
];

function renderNotCauses() {
  $('#not-causes').innerHTML = NOT_CAUSES.map(([title, body]) => `
    <div class="timing-note">
      <div class="num" style="font-size:22px;color:var(--bad)">not</div>
      <div class="txt"><strong style="color:var(--text)">${title}.</strong> ${body}</div>
    </div>`).join('');
}

/* ======================================================== APPENDIX ===== */

const METHOD_RULES = [
  'A student\'s score for a component is their <strong>best accepted attempt</strong>, matching the portal\'s own rule. Attempts with <code>total &lt; 0</code> are refused saves and excluded from scores but counted in rejection rates.',
  'Percentages are <code>total / max</code>, so components with different mark totals compare directly.',
  '"Shared endpoint" counts four specific hosts that many students submitted as their own service. It is a <strong>floor, not a total</strong> — others certainly existed.',
  'A question counts as "farmed" when a shared endpoint was submitted for it <em>and scored</em>.',
  'The forum window is threads created from 1 May 2026. The collection window starts 1 April and holds 371 threads; the 90 from April belong to the previous term and are excluded.',
  'All times are IST. Forum timestamps are stored UTC and shifted by 5h30m.',
];

const METHOD_LIMITS = [
  '<strong>Live-session attendance is not measured.</strong> The 150 → 50 → 10 → 0 figures are the course team\'s own account and appear only in the written review, never in a chart here.',
  '<strong>Rejection reasons are a sample.</strong> 5,305 saves were refused, but error text survives only for each student\'s last attempt — so the reason breakdown covers 315.',
  '<strong>Fine-grained forum labels are noisy</strong> (typical margin 0.03–0.07). The family-level split is robust because low-confidence confusions fall almost entirely within the friction family.',
  '<strong>P1 and ROE offline evaluation artifacts do not exist.</strong> The loudest grievance of the term can be measured in its effects but cannot be audited.',
  'Correlations are <strong>associations, not causal claims</strong>, except where the text names a mechanism — the shared endpoint is a mechanism, and it is directly observable in the answer text.',
];

function renderMethod() {
  $('#method-rules').innerHTML = METHOD_RULES.map(r => `<li>${r}</li>`).join('');
  $('#method-lims').innerHTML = METHOD_LIMITS.map(l => `<li>${l}</li>`).join('');
  renderTable('#terms-table', D.term_totals, [
    { key: 'term', label: 'Term' },
    { key: 'students', label: 'Students', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'attempts', label: 'Saved attempts', cls: 'table-cell-mono', fmt: v => integerFormatter.format(v) },
    { key: 'attempts_per_student', label: 'Per student', cls: 'table-cell-mono' },
    { key: 'rejected', label: 'Refused saves', cls: 'table-cell-bad', fmt: v => integerFormatter.format(v) },
    { key: 'components', label: 'Components', cls: 'table-cell-mono' },
  ], { sort: 'term', desc: false });
}

/* ================================================ PROGRESS + REVEAL ==== */

/** Drop the nav's edge fade when every chapter already fits, so it is a signal rather
 *  than decoration. */
function setupNavFade() {
  const nav = $('nav.nav');
  const sync = () => nav.classList.toggle('is-complete', nav.scrollWidth <= nav.clientWidth + 1);
  sync();
  addEventListener('resize', sync);
}

function setupScrollProgress() {
  const prog = $('#progress');
  const sections = $$('section[id]');
  const onScroll = () => {
    const total = document.body.scrollHeight;
    prog.style.width = (window.scrollY / (total - window.innerHeight) * 100) + '%';
    let current = '';
    sections.forEach(s => { if (s.offsetTop <= window.scrollY + 220) current = s.id; });
    $$('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
  };
  window.addEventListener('scroll', onScroll);
  onScroll();
}

function setupRevealAnimation() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.05 });
  $$('.reveal').forEach(el => obs.observe(el));
}

/* ============================================================== BOOT ==== */

// Charts read `offsetWidth`, so they run after first layout and again on resize.
const CHARTS = [
  renderEffortChart, renderParticipationChart, renderCohortDumbbell, renderInversionScatter,
  renderEffortArcChart, renderTwoTermsChart, renderComponentTimeline, renderAdoptionChart,
  renderResistanceChart, renderJudgeEffortChart, renderJudgeScatter, renderGa5Chart,
  renderFrictionChart, renderLatencyChart,
];

function initializeReport() {
  renderHero();
  renderMetricStrip();
  renderCohortCards();
  renderAssessmentMetrics();
  renderEndpointChapter();
  renderMarksChapter();
  renderJudgeChapter();
  renderInstructionsChapter();
  renderCalendarChapter();
  renderTimingChapter();
  renderForumChapter();
  renderTeamChapter();
  renderRecommendations();
  renderNotCauses();
  renderMethod();
  setupNavFade();
  setupScrollProgress();
  setupRevealAnimation();

  requestAnimationFrame(() => CHARTS.forEach(fn => fn()));

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => CHARTS.forEach(fn => fn()), 200);
  });
}

document.addEventListener('DOMContentLoaded', initializeReport);
