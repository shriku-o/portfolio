import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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

function renderCommitInfo(data, commits) {
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
  dl.append('dd').text(`${longestFile[0]} (${longestFile[1]} lines)`);

  // Average line length (characters)
  dl.append('dt').text('Avg line length');
  dl.append('dd').text(d3.mean(data, (d) => d.length).toFixed(1));

  // Time of day with the most work
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most active period');
  dl.append('dd').text(maxPeriod);
}

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

function renderScatterPlot(data, commits) {
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

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  // Normal direction: 0 (midnight) at the bottom, 24 at the top
const yScale = d3
  .scaleLinear()
  .domain([0, 24])
  .range([usableArea.bottom, usableArea.top]);

  const [start, end] = xScale.domain();

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
    .attr('y', (d) => yScale(d[0]))
    .attr('height', (d) => yScale(d[1]) - yScale(d[0]))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.08);

  // Month bands, alternating shading
  const monthStarts = d3.timeMonth.range(d3.timeMonth.floor(start), end);
  const months = monthStarts.map((m) => ({
    label: d3.timeFormat('%B %Y')(m),
    from: m < start ? start : m,
    to: d3.timeMonth.offset(m, 1) > end ? end : d3.timeMonth.offset(m, 1),
  }));

  const monthGroup = svg.append('g').attr('class', 'months');

  monthGroup
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
  monthGroup
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

  // Horizontal gridlines
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Axes: X shows day of month only
  const numDays = d3.timeDay.count(start, end);
  const dayStep = Math.max(1, Math.ceil(numDays / 25));

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeDay.every(dayStep))
    .tickFormat(d3.timeFormat('%-d'));

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Dots last, so they draw on top
  const dots = svg.append('g').attr('class', 'dots');

  dots
  .selectAll('circle')
  .data(commits)
  .join('circle')
  .attr('cx', (d) => xScale(d.datetime))
  .attr('cy', (d) => yScale(d.hourFrac))
  .attr('r', 5)
  .attr('fill', (d) => {
    const dayness = 1 - Math.abs(d.hourFrac - 12) / 12;
    return d3.interpolateRgb('steelblue', 'orange')(dayness);
  })
  .on('mouseenter', (event, commit) => {
    renderTooltipContent(commit);
    updateTooltipVisibility(true);
    updateTooltipPosition(event);
  })
  .on('mouseleave', () => {
    updateTooltipVisibility(false);
  });
}

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);