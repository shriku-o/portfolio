import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// ---------- Shared state ----------
let xScale;
let yScale;

const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 55, left: 50 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

let commitProgress = 100;
let timeScale;
let commitMaxTime;
let filteredCommits;

// ---------- Data loading ----------
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,
        url: 'https://github.com/shriku-o/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Hidden property: won't clutter console.log, but is still accessible
      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });

      return ret;
    });
}

// ---------- Stats panel (re-runnable) ----------
function renderCommitInfo(data, commits) {
  d3.select('#stats').selectAll('*').remove();

  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Total LOC
  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  // Total commits
  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Number of files
  const numFiles = d3.group(data, (d) => d.file).size;
  dl.append('dt').text('Files');
  dl.append('dd').text(numFiles);

  // Longest file (in lines)
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  const longestFile = d3.greatest(fileLengths, (d) => d[1]);
  dl.append('dt').text('Longest file');
  dl.append('dd').text(longestFile ? `${longestFile[0]} (${longestFile[1]} lines)` : '—');

  // Average line length (characters)
  dl.append('dt').text('Avg line length');
  dl.append('dd').text(data.length ? d3.mean(data, (d) => d.length).toFixed(1) : '—');

  // Time of day with the most work
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most active period');
  dl.append('dd').text(maxPeriod ?? '—');
}

// ---------- Tooltip ----------
function renderTooltipContent(commit) {
  if (Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id.slice(0, 8);

  document.getElementById('commit-date').textContent =
    commit.datetime?.toLocaleString('en', { dateStyle: 'full' });

  document.getElementById('commit-time').textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' });

  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

// ---------- Brushing ----------
function createBrushSelector(svg) {
  svg.call(
    d3
      .brush()
      .extent([
        [xScale.range()[0], yScale.range()[1]],
        [xScale.range()[1], yScale.range()[0]],
      ])
      .on('start brush end', brushed),
  );

  // Move the dots (and anything after the overlay) above the brush overlay,
  // so tooltips still work
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  document.querySelector('#selection-count').textContent = `${
    selectedCommits.length || 'No'
  } commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  // Count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// ---------- Chart helpers ----------
function makeXAxis() {
  const [start, end] = xScale.domain();
  const numDays = d3.timeDay.count(start, end);
  const dayStep = Math.max(1, Math.ceil(numDays / 25));
  return d3
    .axisBottom(xScale)
    .ticks(d3.timeDay.every(dayStep))
    .tickFormat(d3.timeFormat('%-d'));
}

function renderMonthBands(svg) {
  const [start, end] = xScale.domain();
  const monthStarts = d3.timeMonth.range(d3.timeMonth.floor(start), end);
  const months = monthStarts.map((m) => ({
    label: d3.timeFormat('%B %Y')(m),
    from: m < start ? start : m,
    to: d3.timeMonth.offset(m, 1) > end ? end : d3.timeMonth.offset(m, 1),
  }));

  let group = svg.select('g.months');
  if (group.empty()) group = svg.append('g').attr('class', 'months');
  group.selectAll('*').remove();

  group
    .selectAll('rect')
    .data(months)
    .join('rect')
    .attr('x', (d) => xScale(d.from))
    .attr('width', (d) => xScale(d.to) - xScale(d.from))
    .attr('y', usableArea.top)
    .attr('height', usableArea.height)
    .attr('fill', 'currentColor')
    .attr('fill-opacity', (d, i) => (i % 2 === 0 ? 0.05 : 0));

  // Month labels under the axis, centered in each band
  group
    .selectAll('text')
    .data(months)
    .join('text')
    .attr('x', (d) => (xScale(d.from) + xScale(d.to)) / 2)
    .attr('y', usableArea.bottom + 42)
    .attr('text-anchor', 'middle')
    .attr('font-size', 14)
    .attr('font-weight', 'bold')
    .attr('fill', 'currentColor')
    .text((d) => d.label);
}

function drawDots(dots, commits, rScale) {
  // Largest dots first, so small dots draw on top and stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id) // key = stable circles (Step 1.3)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines)) // for constant-speed transitions
    .attr('fill', (d) => {
      const dayness = 1 - Math.abs(d.hourFrac - 12) / 12; // 0 at midnight, 1 at noon
      return d3.interpolateRgb('steelblue', 'orange')(dayness);
    })
    .style('fill-opacity', 0.7) // transparency for overlapping dots
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1); // full opacity on hover
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// ---------- Scatter plot ----------
function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Night bands (00:00-06:00 and 18:00-24:00)
  const nightBands = [
    [0, 6],
    [18, 24],
  ];
  svg
    .append('g')
    .attr('class', 'night-bands')
    .selectAll('rect')
    .data(nightBands)
    .join('rect')
    .attr('x', usableArea.left)
    .attr('width', usableArea.width)
    .attr('y', (d) => Math.min(yScale(d[0]), yScale(d[1])))
    .attr('height', (d) => Math.abs(yScale(d[1]) - yScale(d[0])))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.08);

  // Month bands, alternating shading
  renderMonthBands(svg);

  // Horizontal gridlines
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Axes
  const xAxis = makeXAxis();
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  // Radius scale: circle AREA proportional to lines edited
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  // Dots last, so they draw on top
  const dots = svg.append('g').attr('class', 'dots');
  drawDots(dots, commits, rScale);

  createBrushSelector(svg);
}

function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(makeXAxis());

  renderMonthBands(svg);
  drawDots(svg.select('g.dots'), commits, rScale);
}

// ---------- Time slider ----------
function onTimeSliderChange() {
  const slider = document.getElementById('commit-progress');
  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);

  document.getElementById('commit-max-time').textContent =
    commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredLines = filteredCommits.flatMap((d) => d.lines);

  updateScatterPlot(data, filteredCommits);
  renderCommitInfo(filteredLines, filteredCommits);
}

// ---------- Init ----------
let data = await loadData();
let commits = processCommits(data);
filteredCommits = commits;

timeScale = d3
  .scaleTime()
  .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
  .range([0, 100]);
commitMaxTime = timeScale.invert(commitProgress);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);

document
  .getElementById('commit-progress')
  .addEventListener('input', onTimeSliderChange);
onTimeSliderChange(); // initialize on page load