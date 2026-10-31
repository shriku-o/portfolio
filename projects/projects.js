import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const title = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

let colors = d3.scaleOrdinal(d3.schemeTableau10);
const HIGHLIGHT = 'oklch(60% 45% 0)'; // color of the selected wedge / legend swatch

// Shared state: BOTH filters live here, so they can always be combined
let query = '';
let selectedYear = null; // replaces selectedIndex (null = nothing selected)

// Projects that match the search query (the pie chart is built from these)
function getSearchFiltered() {
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

// Pie chart + legend, built from the search-filtered projects
function renderPieChart(projectsGiven) {
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  let sliceGenerator = d3.pie().value((d) => d.value);
  let arcData = sliceGenerator(data);

  // clear old paths and legend items
  let svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  let legend = d3.select('.legend');
  legend.selectAll('li').remove();

  // Step 5.2: click toggles the selected year (click again to deselect)
  function toggleYear(label) {
    selectedYear = selectedYear === label ? null : label;
    render();
  }

  arcData.forEach((d) => {
    svg
      .append('path')
      .attr('d', arcGenerator(d))
      .attr('fill', d.data.label === selectedYear ? HIGHLIGHT : colors(d.data.label))
      .attr('class', d.data.label === selectedYear ? 'selected' : null)
      .on('click', () => toggleYear(d.data.label));
  });

  data.forEach((d) => {
    legend
      .append('li')
      .attr('class', d.label === selectedYear ? 'legend-item selected' : 'legend-item')
      .attr('style', `--color:${d.label === selectedYear ? HIGHLIGHT : colors(d.label)}`)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => toggleYear(d.label));
  });
}

// One function applies BOTH filters and redraws everything
function render() {
  let searchFiltered = getSearchFiltered();

  // If the selected year vanished from the search results, clear the selection
  if (selectedYear !== null && !searchFiltered.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }

  let visibleProjects =
    selectedYear === null
      ? searchFiltered
      : searchFiltered.filter((p) => p.year === selectedYear);

  renderProjects(visibleProjects, projectsContainer, 'h2');
  renderPieChart(searchFiltered);
}

// Initial render on page load
render();

if (title && projects) {
  title.textContent = `${projects.length} Projects`;
}

// Search only updates the query, then re-renders with both filters
searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  render();
});