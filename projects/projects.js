import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const title = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

let colors = d3.scaleOrdinal(d3.schemeTableau10);
let query = '';

// Step 4.4: all plotting lives in one function so it can be re-run
function renderPieChart(projectsGiven) {
  // re-calculate rolled data
  let newRolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );

  // re-calculate data
  let newData = newRolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  // re-calculate slice generator, arc data, arcs
  let newArcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  let newSliceGenerator = d3.pie().value((d) => d.value);
  let newArcData = newSliceGenerator(newData);
  let newArcs = newArcData.map((d) => newArcGenerator(d));

  // clear up paths and legend
  let newSVG = d3.select('#projects-pie-plot');
  newSVG.selectAll('path').remove();
  let legend = d3.select('.legend');
  legend.selectAll('li').remove();

  // update paths and legend
  newArcs.forEach((arc, idx) => {
    newSVG.append('path').attr('d', arc).attr('fill', colors(idx));
  });

  newData.forEach((d, idx) => {
    legend
      .append('li')
      .attr('class', 'legend-item')
      .attr('style', `--color:${colors(idx)}`)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
  });
}

// Step 4.3: case-insensitive search across all project metadata
function setQuery(newQuery) {
  query = newQuery;
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

// Render everything once on page load
renderProjects(projects, projectsContainer, 'h2');
renderPieChart(projects);

if (title && projects) {
  title.textContent = `${projects.length} Projects`;
}

// Re-render on every keystroke ('input' updates in real time; 'change' waits for Enter/blur)
searchInput.addEventListener('input', (event) => {
  let filteredProjects = setQuery(event.target.value);
  renderProjects(filteredProjects, projectsContainer, 'h2');
  renderPieChart(filteredProjects);
});